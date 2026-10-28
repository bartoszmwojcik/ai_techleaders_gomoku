import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  Clock,
  EmailMessage,
  EmailSender,
  SendOptions,
} from "./email-sender";

type Options = {
  outboxPath: string;
  from: string;
  clock: Clock;
};

/**
 * Development and test transport: appends each message as one JSON line to the outbox file.
 * The file holds full messages (including links with tokens), so it is git-ignored and the
 * transport is refused in production by `readServerConfig`.
 */
export class FileEmailSender implements EmailSender {
  private readonly outboxPath: string;
  private readonly from: string;
  private readonly clock: Clock;

  constructor({ outboxPath, from, clock }: Options) {
    this.outboxPath = outboxPath;
    this.from = from;
    this.clock = clock;
  }

  async send(
    message: EmailMessage,
    { signal }: SendOptions = {},
  ): Promise<void> {
    signal?.throwIfAborted();
    const line = JSON.stringify({
      at: this.clock.now().toISOString(),
      from: this.from,
      ...message,
    });
    await mkdir(dirname(this.outboxPath), { recursive: true });
    signal?.throwIfAborted();
    await appendFile(
      this.outboxPath,
      `${line}
`,
      "utf8",
    );
  }
}
