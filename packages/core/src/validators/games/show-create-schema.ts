import { z } from "zod";

/**
 * Layouts of a show (spec 2026-11-09-show-mode, B2): two bots, or a bot and an agent joining by code.
 * Only `bot-bot` can be created before phase (c); the type already names both, the state carries it.
 */
export const SHOW_LAYOUTS = ["bot-bot", "bot-agent"] as const;
export type ShowLayout = (typeof SHOW_LAYOUTS)[number];

const botLevel = z.union([z.literal(1), z.literal(2)], { error: "Nieprawidłowy poziom bota." });

/**
 * Body of `POST /api/show` and `POST /api/show/preflight`: the layout and the level of each bot, seat 1
 * first. Strict: an unknown layout, a level outside 1-2 or an extra field is a `400 VALIDATION`.
 */
export const showCreateSchema = z.strictObject(
  {
    layout: z.literal("bot-bot", { error: "Nieprawidłowy układ pokazu." }),
    levels: z.tuple([botLevel, botLevel], { error: "Podaj poziom każdego bota." }),
  },
  { error: "Nieprawidłowe dane pokazu." },
);

export type ShowCreateInput = z.infer<typeof showCreateSchema>;
