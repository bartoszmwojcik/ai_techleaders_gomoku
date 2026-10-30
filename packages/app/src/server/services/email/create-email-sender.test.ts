import { describe, expect, it, vi } from "vitest";

import { readServerConfig } from "../../config";
import { BrevoEmailSender } from "./brevo-email-sender";
import { createEmailSender } from "./create-email-sender";
import { systemClock } from "./email-sender";
import { FileEmailSender } from "./file-email-sender";
import { UnconfiguredEmailSender } from "./unconfigured-email-sender";

const fetchMock = vi.fn() as unknown as typeof fetch;
const pick = (env: Record<string, string>) =>
  createEmailSender({
    serverConfig: readServerConfig(env),
    clock: systemClock,
    fetch: fetchMock,
  });

describe("createEmailSender", () => {
  it("picks the file sender", () => {
    expect(pick({ EMAIL_TRANSPORT: "file" })).toBeInstanceOf(FileEmailSender);
  });

  it("picks the Brevo sender and wires config and the injected fetch", async () => {
    const calls = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    const sender = createEmailSender({
      serverConfig: readServerConfig({
        EMAIL_TRANSPORT: "brevo",
        BREVO_API_KEY: "k",
        EMAIL_FROM_ADDRESS: "gra@example.com",
        EMAIL_FROM_NAME: "Gra",
      }),
      clock: systemClock,
      fetch: calls as unknown as typeof fetch,
    });

    expect(sender).toBeInstanceOf(BrevoEmailSender);
    await sender.send({ to: "a@b.pl", subject: "s", text: "t", html: "h" });
    const init = calls.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string).sender).toEqual({
      email: "gra@example.com",
      name: "Gra",
    });
    expect(init.headers).toMatchObject({ "api-key": "k" });
  });

  it("falls back to the failing sender only when no transport is set", () => {
    expect(pick({})).toBeInstanceOf(UnconfiguredEmailSender);
  });

  it("warns and returns the failing sender when brevo is misconfigured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const base = { EMAIL_TRANSPORT: "brevo" };
    const bad = [
      base,
      { ...base, BREVO_API_KEY: "SECRET-KEY" },
      { ...base, EMAIL_FROM_ADDRESS: "gra@example.com" },
      {
        ...base,
        BREVO_API_KEY: "SECRET-KEY",
        EMAIL_FROM_ADDRESS: "not an address",
      },
    ];
    for (const env of bad) {
      const sender = pick(env);
      expect(sender).toBeInstanceOf(UnconfiguredEmailSender);
      await expect(
        sender.send({ to: "a@b.pl", subject: "s", text: "t", html: "h" }),
      ).rejects.toThrow(/EMAIL_TRANSPORT/);
    }
    expect(warn).toHaveBeenCalledTimes(bad.length);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET-KEY");
    warn.mockRestore();
  });

  it("rejects an unknown transport instead of falling back", () => {
    expect(() => pick({ EMAIL_TRANSPORT: "smtp" })).toThrow(/EMAIL_TRANSPORT/);
  });
});
