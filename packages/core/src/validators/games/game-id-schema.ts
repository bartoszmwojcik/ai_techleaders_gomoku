import { z } from "zod";

/** Id of a game in a URL; anything else is "no such game" (404) before it reaches the database. */
export const gameIdSchema = z.guid();
