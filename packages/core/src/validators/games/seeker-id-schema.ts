import { z } from "zod";

/** Id of a `lobby_seekers` row in a URL; anything else is "no such seeker" (404) before the database. */
export const seekerIdSchema = z.guid();
