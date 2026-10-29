import type { Stone, StoneColor } from "@gomoku/ui/game/board";
import { useSyncExternalStore } from "react";

// Simulated back end of the prototype: accounts, session, invitations, games and the outcomes the scenario
// controls can force. Everything is in memory and fictitious; nothing here talks to a server (map section 3).
// Rules come from .ai/specs/2026-10-24-game-invitations.md (#21): BR-01, BR-11, BR-13, BR-22, BR-26, Q3, Q5,
// Q13, Q18, Q20, Q21.

/** Cell index of a 1-based row and column. */
const at = (row: number, column: number) => (row - 1) * 15 + (column - 1);

export const DEMO_PASSWORD = "drewniana-plansza-2026";
/** Fixed "now" of the demo: Monday 2026-10-26 10:00, Europe/Warsaw (CET, +01:00). */
export const NOW_BASE = Date.parse("2026-10-26T10:00:00+01:00");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const INVITATION_TTL = DAY; // Q3
export const READY_DEADLINE = 15 * MINUTE; // Q21
export const CREATE_LIMIT = 10; // Q13: per player per hour
/** The prototype lets the 6th failed code lookup hit the limit (the product allows 20 per 15 min, Q13). */
export const LOOKUP_LIMIT = 5;
export const BOARD_CELLS = 225; // 15 x 15
export const CLOCK_START = 10 * MINUTE; // BR-04
export const LOW_TIME = 60_000; // #23 Q1: "mało czasu" below one minute
export const REMATCH_TTL = 5 * MINUTE; // rematch Q2
export const GUEST_RESULT_TTL = HOUR; // BR-22, #21 K8: the guest token lives 1 h after the end
export const RETURN_NOTICE_AFTER = 30; // #24 Q2: "Wróciłeś do partii" only after more than 30 s away
export const CODES = ["ABCD-EFGH", "JKMN-PQRS", "TUVW-XYZ2", "3456-789A", "BCDE-FGHJ", "KMNP-QRST"] as const;
export const DEFAULT_CODE = CODES[0];

/** The demo identities of map section 3 (T8, the operator, has no basis in the materials, L10). */
export type RoleCode = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";

export type Account = { email: string; name: string; verified: boolean };

export const ACCOUNTS: Record<string, Account> = {
  "ala@example.com": { email: "ala@example.com", name: "Ala_7", verified: true },
  "kuba@example.com": { email: "kuba@example.com", name: "Kuba_P", verified: false },
  "marek@example.com": { email: "marek@example.com", name: "Marek_Z", verified: true },
  "ewa@example.com": { email: "ewa@example.com", name: "Ewa_B", verified: true },
  "zofia@example.com": { email: "zofia@example.com", name: "Zofia_K", verified: true },
  // Plays against Marek_Z in the seeded game; has no demo role.
  "olek@example.com": { email: "olek@example.com", name: "Olek_R", verified: true },
};

const ROLE_EMAIL: Partial<Record<RoleCode, string>> = {
  T1: "ala@example.com",
  T2: "kuba@example.com",
  T3: "marek@example.com",
  T4: "ewa@example.com",
  T7: "zofia@example.com",
};

export type Opponent = { kind: "account"; email: string } | { kind: "guest" };

export type Game = {
  id: number;
  code: string;
  creator: string;
  opponent: Opponent | null;
  /** Absolute times in ms. */
  createdAt: number;
  expiresAt: number;
  joinedAt: number | null;
  /** The creator's page has shown the game after the opponent joined (`seen_at`, Q20). The joiner has it at once. */
  seenCreator: boolean;
  /** The creator has seen the "Przeciwnik dołączył" step (p03.5). */
  sawJoin: boolean;
  /** The creator cancelled the invitation (L04). */
  cancelled: boolean;
  /** The board and the clocks, once somebody opened the board of a ready game (null before). */
  play: Play | null;
};

export type StoneSide = "creator" | "opponent";

/** How a game ended; `winner` is null for a draw. The line holds the winning cells (5 or more, free-style gomoku, BR-10). */
export type GameResult = { kind: "five" | "timeout" | "resignation" | "draw"; winner: StoneSide | null; line: number[] };

/** The rematch offer of a finished game. Expiry is derived from `at` (5 min), see `rematchView`. */
export type RematchOffer = { from: StoneSide; at: number; declined: null | "decline" | "left" };

export type Play = {
  /** The colour of the creator; the opponent has the other one. Black moves first. */
  creatorColor: StoneColor;
  moves: Stone[];
  turn: StoneColor;
  /** Time left per side at `tickAt` (ms). Only the side to move loses time (BR-05); the server owns the clock (#23). */
  remaining: { creator: number; opponent: number };
  tickAt: number;
  result: GameResult | null;
  finishedAt: number | null;
  rematch: RematchOffer | null;
  /** This game is a rematch: the colours were swapped. */
  fromRematch: boolean;
  /** A guest got a new token for the rematch and has not confirmed it yet (p06.15). */
  tokenNotice: boolean;
};

export type Phase = "waiting" | "expired" | "ready" | "autocancelled" | "playing" | "finished" | "cancelled";

export type CreateOutcome = "auto" | "active" | "waiting" | "limit" | "server" | "network";
export type InviteOverride = "auto" | "limit" | "invalid";

export type Scenario = {
  createOutcome: CreateOutcome;
  /** Failed code lookups hit the limit (p02.3, s07.8). */
  forceLimit: boolean;
  inviteOverride: InviteOverride;
  clipboardUnavailable: boolean;
  shareUnavailable: boolean;
  pollError: boolean;
  /** The opponent joins between opening the cancel dialog and confirming it (Q09). */
  joinBeforeCancel: boolean;
  /** Stage B. The colour of the player who opens the board, drawn at start (#22 Q1). */
  colorDraw: "random" | "viewer-black" | "viewer-white";
  /** Pointer device: "auto" asks the browser (pointer: coarse), the other two force it (#22 Q7). */
  input: "auto" | "mouse" | "touch";
  /** The next move of the viewer ends like this (one shot, then back to "ok"): Q05. */
  moveOutcome: "ok" | "network" | "stale" | "not-your-turn" | "occupied";
  /** The next resignation fails with a network error (one shot). */
  resignFails: boolean;
  /** Where the simulated opponent plays: scattered stones (never five) or a row (five after five moves). */
  opponentPattern: "scatter" | "five";
  /** The database is down (p07.4) and the game page loads slowly (p07.1). */
  dbDown: boolean;
  slowLoad: boolean;
  /** Somebody of the two has another game: accepting a rematch ends in 409 (L22, rematch Q4). */
  rematchConflict: boolean;
  /** The demo time runs on its own for the player to move, `speed` times faster than real time (Q03). */
  autoClock: boolean;
  speed: 1 | 10 | 30;
  /** Which clock the clock buttons act on. */
  clockTarget: "mine" | "theirs";
};

export type Sim = {
  /** Time moved forward by scenario controls (ms). */
  clock: number;
  role: RoleCode;
  /** The game the guest browser (T5) holds a token for (BR-22). */
  guestGame: number | null;
  games: Game[];
  /** Timestamps of game creations per account (Q13). */
  creates: Record<string, number[]>;
  failedLookups: number;
  /** The invitation code the invitation page shows. */
  inviteCode: string | null;
  scenario: Scenario;
  /** A place outside the prototype that the player tried to open. */
  outside: { name: string; kind: OutsideKind } | null;
  /** A one-off message for the next page (e.g. after cancelling). */
  notice: { text: string; screen: "p01" | "p03" | "p04" } | null;
  seq: number;
  /** Bumped by Reset so screens drop their local state. */
  epoch: number;
  /** Width of the preview frame in px, 0 = full. */
  width: number;
  /** The viewer's tab is in the background (p05.12). */
  bg: boolean;
  /** "Wróciłeś do partii" after a long absence, until the next move (p05.10). */
  returned: { text: string; token: number } | null;
  /** The viewer reloaded the game page after the end (p06.5); cleared by the next rematch action. */
  refreshed: boolean;
  /** Bumped when the game page is reloaded: screens drop their local state. */
  reload: number;
  /** The last thing the simulated opponent or the server did that the viewer cannot see (a line in the scenario panel). */
  event: string;
};

export type OutsideKind = "account" | "board" | "other";

export const defaultScenario = (): Scenario => ({
  createOutcome: "auto",
  forceLimit: false,
  inviteOverride: "auto",
  clipboardUnavailable: false,
  shareUnavailable: false,
  pollError: false,
  joinBeforeCancel: false,
  colorDraw: "random",
  input: "auto",
  moveOutcome: "ok",
  resignFails: false,
  opponentPattern: "scatter",
  dbDown: false,
  slowLoad: false,
  rematchConflict: false,
  autoClock: false,
  speed: 10,
  clockTarget: "mine",
});

const seedGames = (): Game[] => [
  // T3 (Marek_Z) plays: BR-13 refusal on create and join. The board is stage B.
  {
    id: 1,
    code: "BCDE-FGHJ",
    creator: "marek@example.com",
    opponent: { kind: "account", email: "olek@example.com" },
    createdAt: NOW_BASE - 40 * MINUTE,
    expiresAt: NOW_BASE - 40 * MINUTE + INVITATION_TTL,
    joinedAt: NOW_BASE - 35 * MINUTE,
    seenCreator: true,
    sawJoin: true,
    cancelled: false,
    // Marek_Z plays black against Olek_R; six stones are down and it is Marek's move.
    play: {
      creatorColor: "black",
      moves: [
        { cell: at(8, 8), color: "black" },
        { cell: at(8, 9), color: "white" },
        { cell: at(9, 9), color: "black" },
        { cell: at(7, 7), color: "white" },
        { cell: at(10, 10), color: "black" },
        { cell: at(9, 7), color: "white" },
      ],
      turn: "black",
      remaining: { creator: 8 * MINUTE + 12_000, opponent: 9 * MINUTE + 5000 },
      tickAt: NOW_BASE,
      result: null,
      finishedAt: null,
      rematch: null,
      fromRematch: false,
      tokenNotice: false,
    },
  },
  // T4 (Ewa_B) waits for an opponent (Q18: her own waiting game).
  {
    id: 2,
    code: "KMNP-QRST",
    creator: "ewa@example.com",
    opponent: null,
    createdAt: NOW_BASE - 30 * MINUTE,
    expiresAt: NOW_BASE - 30 * MINUTE + INVITATION_TTL,
    joinedAt: null,
    seenCreator: false,
    sawJoin: false,
    cancelled: false,
    play: null,
  },
];

const fresh = (): Sim => ({
  clock: 0,
  role: "T1",
  guestGame: null,
  games: seedGames(),
  creates: {},
  failedLookups: 0,
  inviteCode: null,
  scenario: defaultScenario(),
  outside: null,
  notice: null,
  seq: 3,
  epoch: 0,
  width: 0,
  bg: false,
  returned: null,
  refreshed: false,
  reload: 0,
  event: "",
});

let state: Sim = fresh();
const listeners = new Set<() => void>();
const emit = () => {
  syncTicker();
  listeners.forEach((listener) => listener());
};
const set = (patch: Partial<Sim> | ((current: Sim) => Partial<Sim>)) => {
  state = settle({ ...state, ...(typeof patch === "function" ? patch(state) : patch) });
  emit();
};

export function useSim(): Sim {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export const getSim = () => state;
export const nowMs = (sim: Sim = state) => NOW_BASE + sim.clock;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Latency of the simulated server; `?fast` in the address removes it (tests). */
const LATENCY = typeof location !== "undefined" && location.search.includes("fast") ? 0 : 600;

export function formatNow(sim: Sim): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(nowMs(sim));
}

/** "wtorek 27 października, 10:00" */
export function formatValidUntil(ms: number): string {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(ms);
}

// ---- identity ---------------------------------------------------------------------------------------

/** The signed-in account of the chosen demo identity, or null (T5 and T6 have no account). */
export function viewer(sim: Sim): Account | null {
  const email = ROLE_EMAIL[sim.role];
  return email ? (ACCOUNTS[email] ?? null) : null;
}

/** This browser holds a guest token for a game (T5 after joining as a guest, BR-22). */
export const guestToken = (sim: Sim): number | null => (sim.role === "T5" ? sim.guestGame : null);

/** Waiting for the game page after a link (p07.1) takes this long. */
export const LOAD_DELAY = typeof location !== "undefined" && location.search.includes("fast") ? 800 : 1500;

export const nameOf = (email: string) => ACCOUNTS[email]?.name ?? email;
export const opponentName = (g: Game): string => (g.opponent === null ? "" : g.opponent.kind === "guest" ? "Gość" : nameOf(g.opponent.email));

// ---- games ------------------------------------------------------------------------------------------

export function phaseOf(sim: Sim, g: Game): Phase {
  if (g.cancelled) return "cancelled";
  if (g.opponent === null) return nowMs(sim) >= g.expiresAt ? "expired" : "waiting";
  if (g.play) return g.play.result ? "finished" : "playing";
  // Q21: nobody has opened the game for 15 minutes, so it is cancelled and never reaches the history.
  if (!g.seenCreator && nowMs(sim) - (g.joinedAt ?? 0) >= READY_DEADLINE) return "autocancelled";
  return "ready";
}

export type Side = "creator" | "opponent";

export function sideOf(sim: Sim, g: Game): Side | null {
  const account = viewer(sim);
  if (account && g.creator === account.email) return "creator";
  if (account && g.opponent?.kind === "account" && g.opponent.email === account.email) return "opponent";
  if (g.opponent?.kind === "guest" && guestToken(sim) === g.id) return guestTokenValid(sim, g) ? "opponent" : null;
  return null;
}

const isLive = (phase: Phase) => phase === "waiting" || phase === "ready" || phase === "playing";

/** The game the viewer holds a place in (BR-13): waiting, ready or playing. */
export function liveGame(sim: Sim): Game | null {
  return [...sim.games].reverse().find((g) => sideOf(sim, g) !== null && isLive(phaseOf(sim, g))) ?? null;
}

/** The newest game the viewer holds a place in, unless the creator cancelled it: it is what `/games/{id}` shows (p03.9, p04.3 included). */
export function accessibleGame(sim: Sim): Game | null {
  const game = [...sim.games].reverse().find((g) => sideOf(sim, g) !== null) ?? null;
  return game && phaseOf(sim, game) !== "cancelled" ? game : null;
}

/** A guest sees the result until 1 h after the end, then the token stops working (BR-22, #21 K8, p06.7). */
export const guestTokenValid = (sim: Sim, g: Game): boolean => g.play?.finishedAt == null || nowMs(sim) - g.play.finishedAt < GUEST_RESULT_TTL;

export type GameScreenId = "p03" | "p04" | "p05" | "p06";

/** The screen that shows this game to the viewer: p03 (waiting, expired, or the "Przeciwnik dołączył" step), p04 (ready, cancelled for want of an opener), p05 (in progress), p06 (finished). */
export function screenForGame(sim: Sim, g: Game): GameScreenId {
  const phase = phaseOf(sim, g);
  if (phase === "playing") return "p05";
  if (phase === "finished") return "p06";
  if (phase === "waiting" || phase === "expired") return "p03";
  if (phase === "ready" && sideOf(sim, g) === "creator" && !g.sawJoin) return "p03";
  return "p04";
}

/** Where the viewer's game page lives, or null when there is nothing the viewer may open (p07.2). */
export function gameRoute(sim: Sim): GameScreenId | null {
  const g = accessibleGame(sim);
  return g ? screenForGame(sim, g) : null;
}

export const findByCode = (sim: Sim, code: string | null): Game | null => {
  if (!code) return null;
  return [...sim.games].reverse().find((g) => g.code === code) ?? null;
};

// ---- invitation page (s07) --------------------------------------------------------------------------

export type InviteView =
  | "visitor" // s07.1 (and s07.2 after "Graj jako gość")
  | "signed-in" // s07.3
  | "participant" // s07.4 (redirect)
  | "own" // s07.5 (redirect)
  | "other-game" // s07.6
  | "waiting-game" // s07.7
  | "limit" // s07.8
  | "invalid"; // s07.9

export function inviteView(sim: Sim): InviteView {
  if (sim.scenario.forceLimit || sim.failedLookups > LOOKUP_LIMIT || sim.scenario.inviteOverride === "limit") return "limit";
  if (sim.scenario.inviteOverride === "invalid") return "invalid";
  const g = findByCode(sim, sim.inviteCode);
  if (g && isLive(phaseOf(sim, g))) {
    const side = sideOf(sim, g);
    if (side === "creator") return "own";
    if (side === "opponent") return "participant";
  }
  if (!g || phaseOf(sim, g) !== "waiting") return "invalid";
  const mine = liveGame(sim);
  if (viewer(sim)) {
    if (!mine) return "signed-in";
    return phaseOf(sim, mine) === "waiting" ? "waiting-game" : "other-game";
  }
  return mine ? "other-game" : "visitor";
}

/** A looked-up code that points to no waiting game counts as a failed lookup (Q13). */
export function openInvite(code: string) {
  const sim = state;
  const g = findByCode(sim, code);
  const valid = g !== null && phaseOf(sim, g) === "waiting";
  const peekedFailure = !valid && !(g && sideOf(sim, g) && isLive(phaseOf(sim, g)));
  set({ inviteCode: code, failedLookups: peekedFailure && sim.failedLookups <= LOOKUP_LIMIT ? sim.failedLookups + 1 : sim.failedLookups });
}

/** The newest waiting invitation of somebody else: what the review bar opens when no link was followed. */
export function foreignInviteCode(sim: Sim): string | null {
  const account = viewer(sim);
  const waiting = [...sim.games].reverse().find((g) => phaseOf(sim, g) === "waiting" && (!account || g.creator !== account.email));
  return waiting?.code ?? null;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export const dashed = (normalized: string) => (normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized);

export type LookupResult = { kind: "short" } | { kind: "limit" } | { kind: "ok"; code: string };

/** `/join`: shape check, then the limit, then the lookup is shown on the invitation page (p02.2, p02.3, p02.4). */
export async function submitCode(raw: string): Promise<LookupResult> {
  const normalized = normalizeCode(raw);
  if (normalized.length !== 8) return { kind: "short" };
  if (state.scenario.forceLimit || state.failedLookups > LOOKUP_LIMIT) return { kind: "limit" };
  await wait(LATENCY); // p02.5
  openInvite(dashed(normalized));
  return { kind: "ok", code: dashed(normalized) };
}

// ---- actions ----------------------------------------------------------------------------------------

export type CreateResult =
  | { kind: "ok"; gameId: number }
  | { kind: "active" }
  | { kind: "waiting"; gameId: number }
  | { kind: "limit"; minutes: number }
  | { kind: "server" }
  | { kind: "network" };

function nextCode(sim: Sim): string {
  const used = new Set(sim.games.map((g) => g.code));
  return CODES.find((code) => !used.has(code)) ?? `Z${String(sim.seq).padStart(3, "0")}-AAAA`.replace("Z", "Q");
}

function addGame(creator: string): Game {
  const sim = state;
  const now = nowMs(sim);
  const game: Game = {
    id: sim.seq,
    code: nextCode(sim),
    creator,
    opponent: null,
    createdAt: now,
    expiresAt: now + INVITATION_TTL,
    joinedAt: null,
    seenCreator: false,
    sawJoin: false,
    cancelled: false,
    play: null,
  };
  set({ games: [...sim.games, game], seq: sim.seq + 1, creates: { ...sim.creates, [creator]: [...(sim.creates[creator] ?? []), now] } });
  return game;
}

/** "Utwórz zaproszenie" (p01.2 and its outcomes). Order of checks follows #21: limit, then BR-13 (Q4, Q18). */
export async function createGame(): Promise<CreateResult> {
  await wait(LATENCY);
  const sim = state;
  const account = viewer(sim);
  const forced = sim.scenario.createOutcome;
  if (forced === "network") return { kind: "network" };
  if (forced === "server") return { kind: "server" };
  if (!account) return { kind: "server" };
  const recent = (sim.creates[account.email] ?? []).filter((at) => nowMs(sim) - at < HOUR);
  if (forced === "limit" || recent.length >= CREATE_LIMIT) {
    const minutes = recent.length >= CREATE_LIMIT ? Math.max(1, Math.ceil((recent[0]! + HOUR - nowMs(sim)) / MINUTE)) : 23;
    return { kind: "limit", minutes };
  }
  const mine = liveGame(sim);
  if (forced === "active" || (mine && phaseOf(sim, mine) !== "waiting")) return { kind: "active" };
  if (mine) return { kind: "waiting", gameId: mine.id }; // L01
  if (forced === "waiting") return { kind: "waiting", gameId: addGame(account.email).id };
  return { kind: "ok", gameId: addGame(account.email).id };
}

export type AcceptResult = { kind: "ok" } | { kind: "invalid" };

/** "Dołącz do partii", "Rozumiem, graj jako gość", "Anuluj moją partię i dołącz" (Q18). */
export async function acceptInvite(as: "user" | "guest", cancelOwnWaiting = false): Promise<AcceptResult> {
  await wait(LATENCY);
  const sim = state;
  const g = findByCode(sim, sim.inviteCode);
  if (!g || phaseOf(sim, g) !== "waiting") return { kind: "invalid" };
  const account = viewer(sim);
  if (as === "user" && !account) return { kind: "invalid" };
  const now = nowMs(sim);
  const games = sim.games.map((other) => {
    if (cancelOwnWaiting && account && other.creator === account.email && phaseOf(sim, other) === "waiting") return { ...other, cancelled: true };
    if (other.id !== g.id) return other;
    return {
      ...other,
      opponent: (as === "guest" ? { kind: "guest" } : { kind: "account", email: account!.email }) as Opponent,
      joinedAt: now,
      seenCreator: false,
      sawJoin: false,
    };
  });
  // A guest browser is the T5 identity: it now holds the token of this game.
  set(as === "guest" ? { games, role: "T5", guestGame: g.id } : { games });
  return { kind: "ok" };
}

/** The opponent joins a waiting game while the creator watches (scenario control). */
export function opponentJoins(kind: "account" | "guest") {
  const sim = state;
  const g = liveGame(sim);
  if (!g || phaseOf(sim, g) !== "waiting" || sideOf(sim, g) !== "creator") return;
  const email = g.creator === "kuba@example.com" ? "ala@example.com" : "kuba@example.com";
  const opponent: Opponent = kind === "guest" ? { kind: "guest" } : { kind: "account", email };
  set({
    games: sim.games.map((other) => (other.id === g.id ? { ...other, opponent, joinedAt: nowMs(sim), seenCreator: false, sawJoin: false } : other)),
    // The guest browser of this demo is T5; the token belongs to this game.
    ...(kind === "guest" ? { guestGame: g.id } : {}),
  });
}

/** The creator opens the game page (`seen_at`, Q20): the clock may start for both. */
export function creatorOpens(gameId?: number) {
  const sim = state;
  const g = gameId ? sim.games.find((other) => other.id === gameId) : [...sim.games].reverse().find((other) => other.opponent && !other.seenCreator && sideOf(sim, other) !== null);
  if (!g) return;
  set({ games: sim.games.map((other) => (other.id === g.id ? { ...other, seenCreator: true, sawJoin: true } : other)) });
}

export const markJoinSeen = (gameId: number) => set((s) => ({ games: s.games.map((g) => (g.id === gameId ? { ...g, sawJoin: true } : g)) }));

export type CancelResult = { kind: "ok" } | { kind: "too-late" };

/** "Tak, anuluj zaproszenie" (p03.7, p03.8, Q5). Only a waiting game can be cancelled. */
export async function cancelInvitation(gameId: number): Promise<CancelResult> {
  await wait(LATENCY);
  if (state.scenario.joinBeforeCancel) opponentJoinsGame(gameId);
  const sim = state;
  const g = sim.games.find((other) => other.id === gameId);
  if (!g || phaseOf(sim, g) !== "waiting") return { kind: "too-late" };
  set({ games: sim.games.map((other) => (other.id === gameId ? { ...other, cancelled: true } : other)) });
  return { kind: "ok" };
}

function opponentJoinsGame(gameId: number) {
  const sim = state;
  const g = sim.games.find((other) => other.id === gameId);
  if (!g || g.opponent) return;
  const email = g.creator === "kuba@example.com" ? "ala@example.com" : "kuba@example.com";
  set({ games: sim.games.map((other) => (other.id === gameId ? { ...other, opponent: { kind: "account", email }, joinedAt: nowMs(sim), seenCreator: false, sawJoin: false } : other)) });
}

// ---- the game: board, clocks, result (stage B) --------------------------------------------------------

const opposite = (side: StoneSide): StoneSide => (side === "creator" ? "opponent" : "creator");
const otherColor = (color: StoneColor): StoneColor => (color === "black" ? "white" : "black");

export const colorOf = (play: Play, side: StoneSide): StoneColor => (side === "creator" ? play.creatorColor : otherColor(play.creatorColor));
/** The side whose move it is, and so the only side whose clock runs (BR-05). */
export const moverOf = (play: Play): StoneSide => (play.turn === play.creatorColor ? "creator" : "opponent");

/** Time left of a side right now. The server derives it from timestamps (#23 Q4); a finished game has frozen clocks. */
export function remainingMs(sim: Sim, play: Play, side: StoneSide): number {
  const base = play.remaining[side];
  if (play.result || moverOf(play) !== side) return base;
  return Math.max(0, base - Math.max(0, nowMs(sim) - play.tickAt));
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** m:ss like the Zegar gracza component shows it (the component's helper is not exported by the package). */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The run of same-coloured stones through `cell` on the first axis that has five or more (BR-10: six also wins). */
export function winningLine(stones: readonly Stone[], cell: number, color: StoneColor): number[] | null {
  const mine = new Set(stones.filter((stone) => stone.color === color).map((stone) => stone.cell));
  const row = Math.floor(cell / 15);
  const column = cell % 15;
  for (const [dx, dy] of DIRECTIONS) {
    const line = [cell];
    for (const sign of [1, -1]) {
      let x = column + sign * dx!;
      let y = row + sign * dy!;
      while (x >= 0 && x < 15 && y >= 0 && y < 15 && mine.has(y * 15 + x)) {
        line.push(y * 15 + x);
        x += sign * dx!;
        y += sign * dy!;
      }
    }
    if (line.length >= 5) return line.sort((a, b) => a - b);
  }
  return null;
}

function finishPlay(play: Play, result: GameResult, endedAt: number): Play {
  return { ...play, result, finishedAt: endedAt, rematch: null };
}

/** Lazy resolution (#23, #24 K2): a clock that ran out while nobody looked ends the game at the moment it hit zero. */
function settle(sim: Sim): Sim {
  let changed = false;
  const games = sim.games.map((g) => {
    const play = g.play;
    if (!play || play.result) return g;
    const mover = moverOf(play);
    if (remainingMs(sim, play, mover) > 0) return g;
    changed = true;
    const endedAt = play.tickAt + play.remaining[mover];
    const frozen = { ...play, remaining: { ...play.remaining, [mover]: 0 } };
    return { ...g, play: finishPlay(frozen, { kind: "timeout", winner: opposite(mover), line: [] }, endedAt) };
  });
  return changed ? { ...sim, games } : sim;
}

/** A move of `side`: the mover's clock stops at the time left, the other one starts (BR-05). */
function applyMove(sim: Sim, play: Play, side: StoneSide, cell: number): Play {
  const color = colorOf(play, side);
  const moves = [...play.moves, { cell, color }];
  const next: Play = {
    ...play,
    moves,
    turn: otherColor(color),
    remaining: { ...play.remaining, [side]: remainingMs(sim, play, side) },
    tickAt: nowMs(sim),
  };
  const line = winningLine(moves, cell, color);
  if (line) return finishPlay(next, { kind: "five", winner: side, line }, nowMs(sim));
  if (moves.length >= BOARD_CELLS) return finishPlay(next, { kind: "draw", winner: null, line: [] }, nowMs(sim));
  return next;
}

const patchGame = (gameId: number, change: (g: Game) => Game) => set((s) => ({ games: s.games.map((g) => (g.id === gameId ? change(g) : g)) }));
const patchPlay = (gameId: number, change: (play: Play, sim: Sim) => Play) =>
  patchGame(gameId, (g) => (g.play ? { ...g, play: change(g.play, state) } : g));

const initialPlay = (creatorColor: StoneColor, fromRematch: boolean, tokenNotice: boolean, sim: Sim): Play => ({
  creatorColor,
  moves: [],
  turn: "black",
  remaining: { creator: CLOCK_START, opponent: CLOCK_START },
  tickAt: nowMs(sim),
  result: null,
  finishedAt: null,
  rematch: null,
  fromRematch,
  tokenNotice,
});

/** "Przejdź do planszy" on a ready game: the colours are drawn, both clocks stand at 10:00 and the player to move starts his (Q20: both have `seen_at`). */
export function startPlay(gameId: number, forcedColor?: StoneColor) {
  const sim = state;
  const g = sim.games.find((candidate) => candidate.id === gameId);
  const side = g ? sideOf(sim, g) : null;
  if (!g || !side || g.play || phaseOf(sim, g) !== "ready") return;
  const draw = sim.scenario.colorDraw;
  const mine: StoneColor = forcedColor ?? (draw === "viewer-black" ? "black" : draw === "viewer-white" ? "white" : Math.random() < 0.5 ? "black" : "white");
  patchGame(g.id, (game) => ({ ...game, play: initialPlay(side === "creator" ? mine : otherColor(mine), false, false, sim) }));
}

/** The game the viewer sees on the board, with the viewer's side. */
export function playOf(sim: Sim): { game: Game; play: Play; side: StoneSide } | null {
  const game = accessibleGame(sim);
  const side = game ? sideOf(sim, game) : null;
  return game?.play && side ? { game, play: game.play, side } : null;
}

export type MoveResult = { kind: "ok" } | { kind: "network" } | { kind: "stale" } | { kind: "not-your-turn" } | { kind: "occupied" } | { kind: "finished" };

// Stones the simulated opponent plays: scattered cells that never make five, or a row that does (A-12 of the grey prototype).
const scattered = (offset: number) => Array.from({ length: 15 }, (_, i) => ((2 * i) % 15) * 15 + ((7 * i + offset) % 15));
const SCATTER: readonly number[] = [...scattered(3), ...scattered(8)];
const ROW_OF_FIVE: readonly number[] = [3, 4, 5, 6, 7].map((column) => at(13, column));

function nextCellFor(play: Play, pattern: Scenario["opponentPattern"]): number {
  const taken = new Set(play.moves.map((stone) => stone.cell));
  const pool = pattern === "five" ? [...ROW_OF_FIVE, ...SCATTER] : SCATTER;
  const free = pool.find((cell) => !taken.has(cell));
  if (free !== undefined) return free;
  return Array.from({ length: BOARD_CELLS }, (_, cell) => cell).find((cell) => !taken.has(cell)) ?? 0;
}

/** The viewer puts a stone (p05.1, p05.5, p05.6): the server checks the rules, the scenario can force an outcome (Q05). */
export async function placeStone(gameId: number, cell: number): Promise<MoveResult> {
  await wait(LATENCY);
  const g = state.games.find((candidate) => candidate.id === gameId);
  const me = g ? sideOf(state, g) : null;
  if (!g?.play || !me || g.play.result) return { kind: "finished" };
  const forced = state.scenario.moveOutcome;
  if (forced !== "ok") set((s) => ({ scenario: { ...s.scenario, moveOutcome: "ok" } }));
  if (forced === "network" || forced === "stale") return { kind: forced };
  const play = g.play;
  const occupied = play.moves.some((stone) => stone.cell === cell);
  if (forced === "occupied" && !occupied) {
    // The view was out of date: the opponent's stone was there already.
    patchPlay(gameId, (p) => ({ ...p, moves: [...p.moves, { cell, color: colorOf(p, opposite(me)) }] }));
    return { kind: "occupied" };
  }
  if (forced === "not-your-turn" && moverOf(play) === me) {
    // The move came from another tab of the same player: the server already has it, this one is late.
    patchPlay(gameId, (p, s) => applyMove(s, p, me, nextCellFor(p, "scatter")));
    return { kind: "not-your-turn" };
  }
  if (moverOf(play) !== me) return { kind: "not-your-turn" };
  if (occupied) return { kind: "occupied" };
  patchPlay(gameId, (p, s) => applyMove(s, p, me, cell));
  set({ returned: null });
  return { kind: "ok" };
}

/** The simulated opponent plays one stone (scenario control "Przeciwnik gra ruch"). Returns false when it is not his turn. */
export function opponentPlays(): boolean {
  const found = playOf(state);
  if (!found || found.play.result || moverOf(found.play) === found.side) return false;
  const cell = nextCellFor(found.play, state.scenario.opponentPattern);
  patchPlay(found.game.id, (p, s) => applyMove(s, p, opposite(found.side), cell));
  return true;
}

export type ResignResult = { kind: "ok" } | { kind: "network" } | { kind: "finished" };

/** "Poddaj partię" confirmed (p05.14): any time during the game (resignation Q1). */
export async function resignGame(gameId: number): Promise<ResignResult> {
  await wait(LATENCY);
  const g = state.games.find((candidate) => candidate.id === gameId);
  const me = g ? sideOf(state, g) : null;
  if (!g?.play || !me || g.play.result) return { kind: "finished" };
  if (state.scenario.resignFails) {
    set((s) => ({ scenario: { ...s.scenario, resignFails: false } }));
    return { kind: "network" };
  }
  patchPlay(gameId, (p, s) => finishPlay(p, { kind: "resignation", winner: opposite(me), line: [] }, nowMs(s)));
  return { kind: "ok" };
}

export function opponentResigns(): boolean {
  const found = playOf(state);
  if (!found || found.play.result) return false;
  patchPlay(found.game.id, (p, s) => finishPlay(p, { kind: "resignation", winner: found.side, line: [] }, nowMs(s)));
  return true;
}

// Time controls of the game clock (#23). The target is the viewer's clock or the opponent's.

const targetSide = (side: StoneSide, target: Scenario["clockTarget"]): StoneSide => (target === "mine" ? side : opposite(side));

function changeClock(change: (current: number) => number): boolean {
  const found = playOf(state);
  if (!found || found.play.result) return false;
  const target = targetSide(found.side, state.scenario.clockTarget);
  patchPlay(found.game.id, (p, s) => {
    const rebased = moverOf(p) === target ? { tickAt: nowMs(s) } : {};
    return { ...p, ...rebased, remaining: { ...p.remaining, [target]: Math.max(1000, change(remainingMs(s, p, target))) } };
  });
  return true;
}

/** "+30 s", "+1 min" and "Skocz do 0:50" on the chosen clock. */
export const addToClock = (ms: number) => changeClock((current) => current + ms);
export const jumpClockTo = (ms: number) => changeClock(() => ms);

/** "Minął czas": the chosen clock reaches zero, the game ends at once (BR-07). */
export function expireClock(): boolean {
  const found = playOf(state);
  if (!found || found.play.result) return false;
  const loser = targetSide(found.side, state.scenario.clockTarget);
  patchPlay(found.game.id, (p, s) =>
    finishPlay({ ...p, remaining: { ...p.remaining, [loser]: 0 } }, { kind: "timeout", winner: opposite(loser), line: [] }, nowMs(s)),
  );
  return true;
}

// Ready-made positions (A-15 of the grey prototype): filling a board by hand takes too long to review the result screens.

const WIN_ROW = [6, 7, 8, 9, 10].map((column) => at(8, column));
const LOSER_ROW = [4, 5, 7, 8, 9].map((column) => at(10, column));
/** A full board in which nobody has five: colour by (row / 2 + column) parity. 113 black and 112 white stones, so the black stone is the last one. */
function drawStones(): Stone[] {
  const blacks: number[] = [];
  const whites: number[] = [];
  for (let cell = 0; cell < BOARD_CELLS; cell++) (((Math.floor(cell / 15) >> 1) + (cell % 15)) % 2 === 0 ? blacks : whites).push(cell);
  return blacks.flatMap((cell, i): Stone[] => {
    const white = whites[i];
    return white === undefined ? [{ cell, color: "black" }] : [{ cell, color: "black" }, { cell: white, color: "white" }];
  });
}
export const DRAW_STONES = drawStones();

export type Preset = "win" | "loss" | "draw" | "almost-full";

/** Overwrites the board of the viewer's game with a ready position; "win", "loss" and "draw" end the game. Returns false when there is no game in progress. */
export function showPosition(preset: Preset): boolean {
  const found = playOf(state);
  if (!found || found.play.result) return false;
  const { game, play, side } = found;
  const now = nowMs(state);
  if (preset === "almost-full") {
    // The viewer plays black and has the last free cell: one click ends in a real draw.
    const creatorColor = side === "creator" ? "black" : "white";
    patchPlay(game.id, (p, s) => ({ ...p, creatorColor, moves: DRAW_STONES.slice(0, -1), turn: "black", tickAt: nowMs(s) }));
    return true;
  }
  if (preset === "draw") {
    patchPlay(game.id, (p) => finishPlay({ ...p, moves: DRAW_STONES, turn: "white" }, { kind: "draw", winner: null, line: [] }, now));
    return true;
  }
  const winnerSide = preset === "win" ? side : opposite(side);
  const winnerColor = colorOf(play, winnerSide);
  const loserColor = otherColor(winnerColor);
  // Alternating order, black first, the winner's stone last.
  const losers = LOSER_ROW.slice(0, winnerColor === "black" ? 4 : 5);
  const moves: Stone[] = [];
  WIN_ROW.forEach((cell, i) => {
    const winnerStone: Stone = { cell, color: winnerColor };
    const loserStone: Stone[] = losers[i] === undefined ? [] : [{ cell: losers[i]!, color: loserColor }];
    moves.push(...(winnerColor === "black" ? [winnerStone, ...loserStone] : [...loserStone, winnerStone]));
  });
  patchPlay(game.id, (p) => finishPlay({ ...p, moves, turn: loserColor }, { kind: "five", winner: winnerSide, line: WIN_ROW }, now));
  return true;
}

// A tab in the background (#24): the clock runs on, so the player comes back to a smaller clock.

const BACKGROUND_PAUSE = typeof location !== "undefined" && location.search.includes("fast") ? 0 : 800;
const RETURN_NOTICE_MS = 8000;
let returnToken = 0;

/** The viewer is back after `seconds`: the clock of the player to move has shrunk by that much (BR-06); a long absence earns a message. */
export function returnFromBackground(seconds: number) {
  set((s) => ({ bg: false, returned: null, clock: s.clock + seconds * 1000 }));
  const after = playOf(state);
  if (!after || after.play.result || seconds <= RETURN_NOTICE_AFTER) return;
  const token = ++returnToken;
  set({ returned: { text: `Wróciłeś do partii. Twój zegar: ${formatClock(remainingMs(state, after.play, after.side))}.`, token } });
  setTimeout(() => {
    if (state.returned?.token === token) set({ returned: null });
  }, RETURN_NOTICE_MS);
}

/** Scenario control "Karta w tle": polling stops for a moment (p05.12), then the player is back. */
export function backgroundTab(seconds: number) {
  if (!playOf(state)) return;
  set({ bg: true });
  setTimeout(() => returnFromBackground(seconds), BACKGROUND_PAUSE);
}

/** "Odśwież stronę partii" (p06.5): the page is loaded again from the server; a finished game shows its result and allows no move (#24 K3). */
export const reloadGamePage = () => set((s) => ({ reload: s.reload + 1, refreshed: playOf(s)?.play.result != null, returned: null }));

// Auto clock: the demo time runs by itself for the player to move (prototype control).

const TICK_MS = 250;
let ticker: ReturnType<typeof setInterval> | null = null;
function syncTicker() {
  const wanted = state.scenario.autoClock;
  if (wanted && ticker === null) {
    ticker = setInterval(() => {
      const running = state.games.some((g) => g.play && !g.play.result);
      if (running) set((s) => ({ clock: s.clock + TICK_MS * s.scenario.speed }));
      else set((s) => ({ scenario: { ...s.scenario, autoClock: false } }));
    }, TICK_MS);
  } else if (!wanted && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

// ---- rematch ---------------------------------------------------------------------------------------------

export type RematchView =
  | { kind: "none" }
  | { kind: "mine" } // p06.11: waiting for the answer
  | { kind: "theirs" } // p06.12
  | { kind: "declined"; how: "decline" | "left" } // p06.13
  | { kind: "expired" }; // p06.14

export function rematchView(sim: Sim, g: Game, side: StoneSide): RematchView {
  const offer = g.play?.rematch;
  if (!offer) return { kind: "none" };
  if (offer.declined) return offer.from === side ? { kind: "declined", how: offer.declined } : { kind: "none" };
  if (nowMs(sim) - offer.at >= REMATCH_TTL) return { kind: "expired" };
  return { kind: offer.from === side ? "mine" : "theirs" };
}

const setOffer = (gameId: number, offer: RematchOffer | null) => {
  patchPlay(gameId, (p) => ({ ...p, rematch: offer }));
  set({ refreshed: false });
};

/** "Rewanż": the offer is a new game with swapped colours, valid for 5 minutes (L13, rematch Q1, Q2). */
export function proposeRematch(): boolean {
  const found = playOf(state);
  if (!found?.play.result) return false;
  setOffer(found.game.id, { from: found.side, at: nowMs(state), declined: null });
  return true;
}

/** "Wycofaj propozycję", "Odrzuć" and "Zaproponuj ponownie" (an expired offer): the offer disappears. */
export function clearRematch() {
  const found = playOf(state);
  if (found?.play.result) setOffer(found.game.id, null);
}

/** The viewer leaves for the main page: an offer of his own counts as declined (L21), the opponent's offer is dropped. */
export function leaveToPanel() {
  const found = playOf(state);
  const offer = found?.play.rematch;
  if (!found?.play.result || !offer || offer.declined) return;
  setOffer(found.game.id, offer.from === found.side ? { ...offer, declined: "left" } : null);
}

export type RematchAccept = { kind: "ok"; gameId: number } | { kind: "conflict" };

/** A new game of the same two players with the colours swapped; the old game stays in the list (A-26). */
function createRematch(old: Game): Game {
  const sim = state;
  const now = nowMs(sim);
  const guest = old.opponent?.kind === "guest";
  const game: Game = {
    ...old,
    id: sim.seq,
    code: nextCode(sim),
    createdAt: now,
    expiresAt: now + INVITATION_TTL,
    joinedAt: now,
    seenCreator: true,
    sawJoin: true,
    cancelled: false,
    play: initialPlay(otherColor(old.play!.creatorColor), true, guest && sim.role === "T5", sim),
  };
  set({ games: [...sim.games, game], seq: sim.seq + 1, ...(guest ? { guestGame: game.id } : {}), refreshed: false });
  return game;
}

/** "Przyjmij" (the viewer) with BR-13 checked at acceptance (rematch Q4, L22): a player with another game gets 409 and the offer stays. */
export async function acceptRematch(): Promise<RematchAccept> {
  await wait(LATENCY);
  const found = playOf(state);
  const offer = found?.play.rematch;
  if (!found || !offer || offer.declined || state.scenario.rematchConflict) return { kind: "conflict" };
  return { kind: "ok", gameId: createRematch(found.game).id };
}

export type OpponentRematch = "propose" | "withdraw" | "accept" | "decline" | "leave";

/** The simulated opponent answers or proposes (scenario controls, rematch Q1–Q4). Returns what happened, for the line in the panel. */
export function opponentRematch(action: OpponentRematch): string {
  const found = playOf(state);
  let line = "Nie dotyczy: partia nie jest zakończona.";
  if (found?.play.result) {
    const { game, side, play } = found;
    const offer = play.rematch && !play.rematch.declined ? play.rematch : null;
    const theirs = offer !== null && offer.from !== side;
    const mine = offer !== null && offer.from === side;
    if (action === "propose") {
      setOffer(game.id, { from: opposite(side), at: nowMs(state), declined: null });
      line = "Przeciwnik proponuje rewanż.";
    } else if (action === "withdraw") {
      if (theirs) setOffer(game.id, null);
      line = theirs ? "Przeciwnik wycofał propozycję." : "Nie dotyczy: przeciwnik nic nie proponował.";
    } else if (!mine) {
      line = "Nie dotyczy: nie zaproponowałeś rewanżu.";
    } else if (action === "accept") {
      if (state.scenario.rematchConflict) line = "Przeciwnik chciał przyjąć rewanż, ale ma inną partię (409). Propozycja trwa.";
      else {
        createRematch(game);
        line = "Przeciwnik przyjął rewanż: nowa partia z odwróconymi kolorami.";
      }
    } else {
      setOffer(game.id, { ...offer, declined: action === "leave" ? "left" : "decline" });
      line = action === "leave" ? "Przeciwnik wyszedł do panelu głównego." : "Przeciwnik odrzucił rewanż.";
    }
  }
  set({ event: line });
  return line;
}

/** "Rozumiem" under the new-token notice of a guest (p06.15). */
export function dismissTokenNotice(gameId: number) {
  patchPlay(gameId, (p) => ({ ...p, tokenNotice: false }));
}

// ---- scenario controls ------------------------------------------------------------------------------

export const setRole = (role: RoleCode) => set({ role });
export const setEvent = (event: string) => set({ event });
export const setWidth = (width: number) => set({ width });
export const showOutside = (name: string | null, kind: OutsideKind = "other") => set({ outside: name === null ? null : { name, kind } });
export const setNotice = (notice: Sim["notice"]) => set({ notice });
export const patchScenario = (patch: Partial<Scenario>) => set((s) => ({ scenario: { ...s.scenario, ...patch } }));
export const advanceClock = (ms: number) => set((s) => ({ clock: s.clock + ms }));
export const setClock = (ms: number) => set({ clock: ms });
export const clockSteps = { minute: MINUTE, hour: HOUR, day: DAY };
export const resetSim = () => {
  state = { ...fresh(), epoch: state.epoch + 1 };
  emit();
};

/** Prepares Ala_7's invitation (first free code, ABCD-EFGH in a fresh demo) so the invitation page has something to show. */
export function prepareDemoInvitation(onlyIfNone = false) {
  const sim = state;
  const alas = sim.games.filter((g) => g.creator === "ala@example.com");
  if (onlyIfNone ? alas.length > 0 : alas.some((g) => phaseOf(sim, g) === "waiting")) return;
  const now = nowMs(sim);
  const game: Game = {
    id: sim.seq,
    code: nextCode(sim),
    creator: "ala@example.com",
    opponent: null,
    createdAt: now,
    expiresAt: now + INVITATION_TTL,
    joinedAt: null,
    seenCreator: false,
    sawJoin: false,
    cancelled: false,
    play: null,
  };
  set({ games: [...sim.games, game], seq: sim.seq + 1 });
}

export type DemoStage = "waiting" | "joined" | "opponent-waits" | "ready" | "guest" | "play-black" | "play-white" | "play-guest" | "won" | "lost" | "draw";

/** Shortcuts for reviewers: rebuilds the simulation at a given point of the flow (prototype control, not a product feature). Returns the screen to show. */
export function setupDemo(stage: DemoStage): GameScreenId {
  state = { ...fresh(), epoch: state.epoch + 1, width: state.width };
  emit();
  set({ role: "T1" });
  const game = addGame("ala@example.com");
  if (stage === "waiting") return "p03";
  opponentJoins(stage === "guest" || stage === "play-guest" ? "guest" : "account");
  if (stage === "joined") return "p03";
  if (stage === "ready" || stage.startsWith("play") || stage === "won" || stage === "lost" || stage === "draw") creatorOpens(game.id);
  if (stage === "opponent-waits") set({ role: "T2" });
  if (stage === "guest" || stage === "play-guest") set({ role: "T5" });
  if (stage === "play-black" || stage === "play-guest" || stage === "won" || stage === "lost" || stage === "draw") startPlay(game.id, "black");
  if (stage === "play-white") startPlay(game.id, "white");
  if (stage === "won") showPosition("win");
  if (stage === "lost") showPosition("loss");
  if (stage === "draw") showPosition("draw");
  if (stage === "play-guest" || stage === "play-black" || stage === "play-white") return "p05";
  if (stage === "won" || stage === "lost" || stage === "draw") return "p06";
  return "p04";
}
