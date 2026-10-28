import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { systemClock } from "./email-sender";
import { FileEmailSender } from "./file-email-sender";
import { UnconfiguredEmailSender } from "./unconfigured-email-sender";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "email-outbox-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const message = {
  to: "a@example.com",
  subject: "Temat",
  text: "t",
  html: "<p>h</p>",
};

describe("FileEmailSender", () => {
  it("appends one JSON line per message, creating missing directories", async () => {
    const outboxPath = join(dir, "nested", "outbox.jsonl");
    const clock = { now: () => new Date("2026-10-28T10:00:00.000Z") };
    const sender = new FileEmailSender({ outboxPath, from: "Gomoku", clock });

    await sender.send(message);
    await sender.send({ ...message, to: "b@example.com" });

    const lines = (await readFile(outboxPath, "utf8")).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { at: "2026-10-28T10:00:00.000Z", from: "Gomoku", ...message },
      {
        at: "2026-10-28T10:00:00.000Z",
        from: "Gomoku",
        ...message,
        to: "b@example.com",
      },
    ]);
  });

  it("rejects without writing when the signal is already aborted", async () => {
    const outboxPath = join(dir, "outbox.jsonl");
    const sender = new FileEmailSender({
      outboxPath,
      from: "Gomoku",
      clock: systemClock,
    });
    const signal = AbortSignal.abort();

    await expect(sender.send(message, { signal })).rejects.toThrow();
    await expect(readFile(outboxPath, "utf8")).rejects.toThrow();
  });

  it("accepts a live signal", async () => {
    const outboxPath = join(dir, "outbox.jsonl");
    const sender = new FileEmailSender({
      outboxPath,
      from: "Gomoku",
      clock: systemClock,
    });
    await sender.send(message, { signal: AbortSignal.timeout(5000) });
    expect(await readFile(outboxPath, "utf8")).toContain("a@example.com");
  });

  it("rejects when the outbox cannot be written", async () => {
    const sender = new FileEmailSender({
      outboxPath: dir,
      from: "Gomoku",
      clock: systemClock,
    });
    await expect(sender.send(message)).rejects.toThrow();
  });
});

describe("UnconfiguredEmailSender", () => {
  it("always throws a readable error", async () => {
    await expect(new UnconfiguredEmailSender().send()).rejects.toThrow(
      /No email transport is configured/,
    );
  });
});

describe("systemClock", () => {
  it("returns the current time", () => {
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(
      1000,
    );
  });
});
