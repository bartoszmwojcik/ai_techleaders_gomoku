import { z } from "zod";

/**
 * Layouts of a show (spec 2026-11-09-show-mode, B2): two bots, or a bot and an agent joining by code.
 */
export const SHOW_LAYOUTS = ["bot-bot", "bot-agent"] as const;
export type ShowLayout = (typeof SHOW_LAYOUTS)[number];

const botLevel = z.union([z.literal(1), z.literal(2)], { error: "Nieprawidłowy poziom bota." });

const botVsBot = z.strictObject({
  layout: z.literal("bot-bot"),
  levels: z.tuple([botLevel, botLevel], { error: "Podaj poziom każdego bota." }),
});

const botVsAgent = z.strictObject({
  layout: z.literal("bot-agent"),
  botLevel,
});

/**
 * Body of `POST /api/show` and `POST /api/show/preflight`: `{ layout: "bot-bot", levels: [seat 1, seat 2] }` or
 * `{ layout: "bot-agent", botLevel }` (the bot sits in seat 1, the agent joins seat 2 by code). Strict: an unknown
 * layout, a level outside 1-2 or an extra field is a `400 VALIDATION`.
 */
export const showCreateSchema = z.discriminatedUnion("layout", [botVsBot, botVsAgent], {
  error: (issue) => (issue.code === "invalid_union" ? "Nieprawidłowy układ pokazu." : "Nieprawidłowe dane pokazu."),
});

export type ShowCreateInput = z.infer<typeof showCreateSchema>;

/** The levels of the show's bots, seat 1 first: two in bot vs bot, one (seat 1) in bot vs agent. */
export function showLevels(input: ShowCreateInput): (1 | 2)[] {
  return input.layout === "bot-bot" ? [...input.levels] : [input.botLevel];
}
