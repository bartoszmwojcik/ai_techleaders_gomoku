import { defaultNicknameSeat } from "@gomoku/core/games/nickname";

import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TranslatorOf } from "@/i18n/client";
import type { GameView } from "@/server/http/game-view";

export type CommonTranslator = TranslatorOf<"common">;

/** Polish, from the bundle: the default of the helpers below. */
export const PL_COMMON: CommonTranslator = textsOf<"common">(plCommon);

/**
 * How a participant is named on screen: the nickname or account name, and whether "(gość)" follows
 * (E02-S07, L30). `agent` marks an agent (BR-31): `nick` is then "Agent" and `declared` the model
 * name it gave about itself (unverified), shown as "Agent · {declared} (deklarowane)".
 */
export type PlayerName = {
  nick: string;
  guest: boolean;
  label: string;
  agent?: { declared: string | null };
};

/** The bot's strength as the views carry it (I14): the level and, for level 2, the size of its table. */
export type BotStrength = { level: number; tableMb: number | null };

/** "Bot · poziom 2 · 16 MB" in the reader's language (the same words as the show). */
export function botNameOf({ level, tableMb }: BotStrength, t: CommonTranslator = PL_COMMON): string {
  return tableMb === null ? t("bot.name", { level }) : t("bot.nameWithTable", { level, table: t.megabytes(tableMb) });
}

/** The name of an agent; `declared` is plain text, never markup (BR-31, decision 7 of #138). */
export function agentNameOf(declared: string | null | undefined, t: CommonTranslator = PL_COMMON): PlayerName {
  const name = declared ?? null;
  return {
    nick: t("player.agent"),
    guest: false,
    label: name === null ? t("player.agent") : t("player.agentDeclared", { name }),
    agent: { declared: name },
  };
}

/** `bot.tableMb` is absent in a view from before E15-S04 (an old page or server): the server's name is used then. */
type Player = {
  kind: string;
  seat?: number;
  seen?: boolean;
  displayName?: string | null;
  agentName?: string | null;
  bot?: Partial<BotStrength> & { level: number };
};

/**
 * One name helper for the room, the history and the review (spec I14, Q11). The server's Polish text stays the
 * fallback: a bot is named from its strength when the view carries it; a guest's default nickname ("Gracz 2", which
 * the server composes) is translated — only for a guest seat, never for an account, the bot or an agent; a deleted
 * account (`null`) is "Usunięty gracz".
 */
export function playerNameOf(player: Player | undefined, t: CommonTranslator = PL_COMMON): PlayerName {
  if (player?.kind === "agent") return agentNameOf(player.agentName, t);
  const guest = player?.kind === "guest";
  let nick: string;
  if (player?.kind === "bot") {
    const tableMb = player.bot?.tableMb;
    nick = tableMb === undefined ? (player.displayName ?? t("bot.plain")) : botNameOf({ level: player.bot!.level, tableMb }, t);
  }
  else if (guest && player.displayName) {
    const seat = defaultNicknameSeat(player.displayName);
    nick = seat === null ? player.displayName : t("player.guestDefault", { seat });
  } else nick = player?.displayName ?? t("player.deleted");
  return { nick, guest, label: guest ? t("player.guestLabel", { name: nick }) : nick };
}

/** The full label as one string, for running text ("Gracz 2 (gość) dołączył do partii"). */
export function playerName(player: GameView["players"][number] | undefined, t: CommonTranslator = PL_COMMON): string {
  return playerNameOf(player, t).label;
}
