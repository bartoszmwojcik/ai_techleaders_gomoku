import { readFile } from "node:fs/promises";

export type OutboxMessage = {
  at: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function readLines(path: string): Promise<OutboxMessage[]> {
  try {
    return (await readFile(path, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as OutboxMessage);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

/** Polls the outbox until `count` messages to `to` exist (delivery may be asynchronous). */
export async function waitForMessages(
  path: string,
  to: string,
  count = 1,
  timeoutMs = 10_000,
): Promise<OutboxMessage[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await readLines(path)).filter((m) => m.to === to);
    if (found.length >= count) return found;
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} message(s) to ${to}, found ${found.length}.`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

/** Extracts the raw token and the link from a verification message. */
export function verificationLink(message: OutboxMessage): {
  link: string;
  token: string;
} {
  const link = /https?:\/\/\S+\/verify-email\?\S+/.exec(
    message.text,
  )?.[0] as string;
  const token = new URL(link).searchParams.get("token") as string;
  return { link, token };
}

/** Extracts the raw token and the link from a password reset message. */
export function resetLink(message: OutboxMessage): {
  link: string;
  token: string;
} {
  const link = /https?:\/\/\S+\/reset-password\?\S+/.exec(
    message.text,
  )?.[0] as string;
  const token = new URL(link).searchParams.get("token") as string;
  return { link, token };
}

/** Waits for the reset message to `to` (the verification mail of a fresh account is skipped). */
export async function waitForResetMessage(
  path: string,
  to: string,
  timeoutMs = 10_000,
): Promise<OutboxMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await waitForMessages(path, to, 1, timeoutMs)).find((m) =>
      /\/reset-password\?/.test(m.text),
    );
    if (found) return found;
    if (Date.now() > deadline) {
      throw new Error(`No password reset message to ${to}.`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}
