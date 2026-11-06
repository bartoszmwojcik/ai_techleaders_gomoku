import { getContainer } from "../container";

/** `BOT_ENABLED` for the pages (hosted-bot R19): the "Przeciwnik" group shows only while the bot is on. */
export async function isBotEnabled(): Promise<boolean> {
  return (await getContainer()).cradle.serverConfig.botEnabled;
}
