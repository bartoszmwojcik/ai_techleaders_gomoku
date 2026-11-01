import {
  CHAT_RETENTION_MS,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
  CHAT_REJECTION_MESSAGES,
  deriveChatState,
  normalizeChatMessage,
  type ChatMessageView,
  type ChatReadData,
  type ChatSendData,
  type ChatState,
  type GameStatus,
  type Seat,
} from "@gomoku/core";
import { ForeignKeyConstraintViolationException, type EntityManager } from "@gomoku/db";

import type { ChatConfig } from "../../config";
import { GAME_NOT_FOUND_MESSAGE, type GameParticipant } from "../games/game-service";

type Deps = {
  em: EntityManager;
  chatConfig: ChatConfig;
};

// Every time below is the database's: `clock_timestamp()` moves during a transaction, `now()` does
// not, and a waiting writer would otherwise stamp its message before the one it waited for.
const CREATED_AT = `to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// The asker, the game and the other seat in one query: the state of the chat, the asker's last
// message age (the interval limit) and the size of the conversation (the cap).
const CONTEXT_SQL = `
  select p.id as sender_id, p.seat, p.kind, p.chat_enabled as mine, o.chat_enabled as theirs,
    g.status,
    (g.status = 'finished' and g.finished_at > now() - (? * interval '1 millisecond')) as window_open,
    (select extract(epoch from clock_timestamp() - max(m.created_at)) * 1000
       from chat_messages m where m.sender_id = p.id)::float8 as since_last_ms,
    (select count(*) from chat_messages m where m.game_id = g.id)::int as total
  from game_players p
  join games g on g.id = p.game_id
  left join game_players o on o.game_id = p.game_id and o.id <> p.id
  where p.id = ? and g.id = ?`;

const LOCK_GAME_SQL = `select pg_advisory_xact_lock(hashtextextended(?::text, 0))`;

const SELECT_MESSAGE = `select m.seq, p.seat, m.body, ${CREATED_AT} as created_at
  from chat_messages m join game_players p on p.id = m.sender_id`;

const AFTER_SQL = `${SELECT_MESSAGE} where m.game_id = ? and m.seq > ? order by m.seq limit ?`;
const LATEST_SQL = `select * from (${SELECT_MESSAGE} where m.game_id = ? order by m.seq desc limit ?) latest order by seq`;
const REPEAT_SQL = `${SELECT_MESSAGE} where m.sender_id = ? and m.client_id = ?`;

const INSERT_SQL = `
  insert into chat_messages (game_id, seq, sender_id, client_id, body, created_at)
  values (?, (select coalesce(max(seq), 0) + 1 from chat_messages where game_id = ?), ?, ?, ?, clock_timestamp())`;

type Context = {
  sender_id: string;
  seat: Seat;
  kind: string;
  mine: boolean;
  theirs: boolean | null;
  status: GameStatus;
  window_open: boolean;
  since_last_ms: number | null;
  total: number;
};

type MessageRow = { seq: number; seat: Seat; body: string; created_at: string };

export const CHAT_UNAVAILABLE_MESSAGE = "Czat jest teraz niedostępny w tej partii.";
export const CHAT_DISABLED_MESSAGE = "Czat jest wyłączony.";
export const CHAT_FULL_MESSAGE = "W tej partii jest już maksymalna liczba wiadomości.";
export const CHAT_RATE_LIMITED_MESSAGE = "Poczekaj chwilę przed następną wiadomością.";

function viewOf(row: MessageRow): ChatMessageView {
  return { id: row.seq, seat: row.seat, text: row.body, createdAt: row.created_at };
}

/**
 * The chat of a game (E07-S01): one service for the browser (S01) and, later, the agent (S04), so the
 * rules - who may write, how often, how much, what the text may be - live here and nowhere else. The
 * transport only resolves the participant. Time is the database's, order is the game's advisory lock.
 * The service never logs, and a text is never part of an error.
 */
export class ChatService {
  readonly #em: EntityManager;
  readonly #config: ChatConfig;

  constructor({ em, chatConfig }: Deps) {
    this.#em = em;
    this.#config = chatConfig;
  }

  /**
   * The messages after `afterId` (at most `limit`), or the latest `limit` without it. Nothing is
   * returned unless the chat is `open` or `disabled_by_opponent` (the one who turned the chat off
   * does not see it, R2).
   * @throws AppError 404 when the participant or the game is gone.
   */
  async read(
    participant: GameParticipant,
    gameId: string,
    { afterId, limit }: { afterId?: number; limit: number },
  ): Promise<ChatReadData> {
    const context = await this.#context(this.#em, participant, gameId);
    const state = this.#stateOf(context);
    const limits = this.#limitsOf(context);
    const readable = state === "open" || state === "disabled_by_opponent";
    const rows = readable
      ? afterId === undefined
        ? await this.#em.execute<MessageRow[]>(LATEST_SQL, [gameId, limit])
        : await this.#em.execute<MessageRow[]>(AFTER_SQL, [gameId, afterId, limit])
      : [];
    const messages = rows.map(viewOf);
    const retryAfterMs = state === "open" ? this.#retryAfter(context) : 0;
    return {
      state,
      messages,
      lastId: messages.at(-1)?.id ?? afterId ?? 0,
      limits,
      ...(retryAfterMs > 0 ? { retryAfterMs } : {}),
    };
  }

  /**
   * Stores a message. Order of the checks (one transaction under the game's advisory lock): the text,
   * a retry of the same `clientId` (answered with the message that exists, no limit spent), the state
   * of the chat, the cap of the game, the interval.
   * @throws AppError 400 with `fieldErrors.text` and `data.reason`; 404 for a gone participant; 409
   * `CHAT_UNAVAILABLE` / `CHAT_DISABLED` / `CHAT_FULL`; 429 `RATE_LIMITED` with `data.retryAfterMs`.
   */
  async send(
    participant: GameParticipant,
    gameId: string,
    input: { text: unknown; clientId: string },
  ): Promise<ChatSendData & { created: boolean }> {
    const kind = await this.#kindOf(participant);
    const checked = normalizeChatMessage(input.text, { maxLength: this.#limits(kind).maxLength });
    if (!checked.ok) {
      const message = CHAT_REJECTION_MESSAGES[checked.reason];
      throw new ValidationError(message, {
        fieldErrors: { text: [message] },
        data: { reason: checked.reason },
      });
    }
    try {
      return await this.#em.transactional(async (tx) => {
        await tx.execute(LOCK_GAME_SQL, [gameId], "run");
        const context = await this.#context(tx, participant, gameId);
        const [repeat] = await tx.execute<MessageRow[]>(REPEAT_SQL, [participant.playerId, input.clientId]);
        if (repeat) {
          return { message: viewOf(repeat), retryAfterMs: this.#retryAfter(context), created: false };
        }
        const state = this.#stateOf(context);
        if (state === "unavailable" || state === "closed") {
          throw new ConflictError(CHAT_UNAVAILABLE_MESSAGE, { code: "CHAT_UNAVAILABLE" });
        }
        if (state !== "open") throw new ConflictError(CHAT_DISABLED_MESSAGE, { code: "CHAT_DISABLED" });
        if (context.total >= this.#config.maxMessagesPerGame) {
          throw new ConflictError(CHAT_FULL_MESSAGE, { code: "CHAT_FULL" });
        }
        const wait = this.#retryAfter(context);
        if (wait > 0) {
          throw new TooManyRequestsError(CHAT_RATE_LIMITED_MESSAGE, {
            retryAfterSeconds: Math.ceil(wait / 1000),
            data: { retryAfterMs: wait },
          });
        }
        await tx.execute(
          INSERT_SQL,
          [gameId, gameId, participant.playerId, input.clientId, checked.text],
          "run",
        );
        const [row] = await tx.execute<MessageRow[]>(REPEAT_SQL, [participant.playerId, input.clientId]);
        return {
          message: viewOf(row!),
          retryAfterMs: this.#limitsOf(context).minIntervalMs,
          created: true,
        };
      });
    } catch (error) {
      // The game went away under us (the cleanup): the same answer as for a stranger.
      if (error instanceof ForeignKeyConstraintViolationException) {
        throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      }
      throw error;
    }
  }

  async #kindOf(participant: GameParticipant): Promise<string> {
    const [row] = await this.#em.execute<{ kind: string }[]>(
      "select kind from game_players where id = ?",
      [participant.playerId],
    );
    if (!row) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
    return row.kind;
  }

  async #context(em: EntityManager, participant: GameParticipant, gameId: string): Promise<Context> {
    const [context] = await em.execute<Context[]>(CONTEXT_SQL, [
      CHAT_RETENTION_MS,
      participant.playerId,
      gameId,
    ]);
    if (!context) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
    return context;
  }

  #stateOf(context: Context): ChatState {
    return deriveChatState({
      status: context.status,
      windowOpen: context.window_open,
      mine: context.mine,
      theirs: context.theirs,
    });
  }

  #limits(kind: string) {
    return kind === "agent" ? this.#config.agent : this.#config.human;
  }

  #limitsOf(context: Context) {
    return this.#limits(context.kind);
  }

  /** Milliseconds until the asker may send again; 0 when they may now. */
  #retryAfter(context: Context): number {
    if (context.since_last_ms === null) return 0;
    return Math.max(0, Math.ceil(this.#limitsOf(context).minIntervalMs - context.since_last_ms));
  }
}
