import { AGENT_SECRET_RUN_LENGTH } from "./constants";

const LONG_TOKEN_LIKE = new RegExp(`[A-Za-z0-9_-]{${AGENT_SECRET_RUN_LENGTH},}`);

/**
 * Whether a text an agent wants to send looks like a secret (R10): the agent's own token or any run
 * of base64url characters as long as a token. A token gives the opponent the seat, so the server
 * refuses it before the chat regardless of what the model was told.
 */
export function looksLikeSecret(text: string, token: string): boolean {
  return (token !== "" && text.includes(token)) || LONG_TOKEN_LIKE.test(text);
}
