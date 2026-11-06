// What the bot is to the players (spec 2026-11-05-hosted-bot, R7, R9, BR-55): its levels and the name
// that shows its strength. The parameters are stored with the bot's seat, the name is derived on read.
import type { BotLevel } from "./choose-move";

/** The levels a player may pick (BR-55: the choice is visible from the first release, so there are two). */
export const BOT_LEVELS = [1, 2] as const satisfies readonly BotLevel[];

export function isBotLevel(value: unknown): value is BotLevel {
  return (BOT_LEVELS as readonly unknown[]).includes(value);
}

/** Below this much available memory no new game with the bot starts (R7). */
export const BOT_MIN_MEMORY_MB = 256;

/** The size of the transposition table and the depth limit of level 2 for the memory read at creation (R7). */
export type BotTier = { ttMb: number; depthCap: number };

const TIERS: readonly (BotTier & { fromMb: number })[] = [
  { fromMb: 3072, ttMb: 64, depthCap: 12 },
  { fromMb: 1536, ttMb: 32, depthCap: 10 },
  { fromMb: 768, ttMb: 16, depthCap: 8 },
  { fromMb: BOT_MIN_MEMORY_MB, ttMb: 8, depthCap: 6 },
];

/** The tier of `memoryMb` megabytes of available memory, or `null` below `BOT_MIN_MEMORY_MB`. */
export function botTierOf(memoryMb: number): BotTier | null {
  const tier = TIERS.find(({ fromMb }) => memoryMb >= fromMb);
  return tier ? { ttMb: tier.ttMb, depthCap: tier.depthCap } : null;
}

/**
 * The bot's name (R9): `Bot · poziom 1`; level 2 adds the size of its table, `Bot · poziom 2 · 16 MB`,
 * because only level 2 grows with the memory (BR-57). Without a known tier level 2 reads like level 1.
 */
export function botDisplayName(level: BotLevel, memoryMb: number | null): string {
  const name = `Bot · poziom ${level}`;
  const tier = level === 2 && memoryMb !== null ? botTierOf(memoryMb) : null;
  return tier ? `${name} · ${tier.ttMb} MB` : name;
}

/** What a refused player reads (`503 BOT_UNAVAILABLE`): the server's error and the client's alert share it. */
export const BOT_UNAVAILABLE_MESSAGE = "Bot jest teraz niedostępny. Spróbuj za chwilę albo zaproś osobę.";
