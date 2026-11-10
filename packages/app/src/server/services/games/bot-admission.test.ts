import { BOT_UNAVAILABLE_MESSAGE, ServiceUnavailableError } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerConfig } from "../../config";
import { BOT_RETRY_AFTER_SECONDS, BotAdmission, refuse as refuseBot } from "./bot-admission";
import type { MemorySource } from "./resource-probe";

const NOW = new Date("2026-11-06T10:00:00Z");

function setup({
  enabled = true,
  availableMb = 768,
  source = "process" as MemorySource,
  active = 0,
  maxActiveGames = 3,
  minAvailableMb = 256,
} = {}) {
  const execute = vi.fn(async () => [{ count: active }]);
  const read = vi.fn(() => ({ availableMb, source }));
  const admission = new BotAdmission({
    em: { execute } as unknown as EntityManager,
    serverConfig: { botEnabled: enabled, bot: { maxActiveGames, minAvailableMb } } as unknown as ServerConfig,
    resourceProbe: { read },
    clock: { now: () => NOW },
  });
  return { admission, execute, read };
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceUnavailableError);
  expect(error).toMatchObject({
    status: 503,
    code: "BOT_UNAVAILABLE",
    message: BOT_UNAVAILABLE_MESSAGE,
    retryAfterSeconds: BOT_RETRY_AFTER_SECONDS,
  });
}

describe("BotAdmission (hosted-bot R7, R8, R19)", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("freezes the memory read now in a level-2 seat (BR-57)", async () => {
    const { admission, execute } = setup({ availableMb: 1892 });
    await expect(admission.admit(2)).resolves.toEqual({ level: 2, memoryMb: 1892, depthCap: 10 });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("p.kind = 'bot'"), [NOW]);
  });

  it("stores no memory for level 1", async () => {
    await expect(setup().admission.admit(1)).resolves.toEqual({ level: 1, memoryMb: null, depthCap: null });
  });

  it("counts only active games whose clock has not run out", async () => {
    const { admission, execute } = setup();
    await admission.admit(1);
    const [sql] = execute.mock.calls[0] as unknown as [string];
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("turn_started_at +");
    expect(sql).toMatch(/\) > \?$/);
  });

  it("refuses while BOT_ENABLED is off, without reading anything or logging", async () => {
    const { admission, execute, read } = setup({ enabled: false });
    await refusal(admission.admit(2));
    expect(read).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses under the minimum of available memory, before counting", async () => {
    const { admission, execute } = setup({ availableMb: 255, source: "os" });
    await refusal(admission.admit(1));
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toMatchObject({ event: "bot.refused", reason: "memory", availableMb: 255, source: "os" });
  });

  it("takes a higher configured minimum", async () => {
    await refusal(setup({ availableMb: 500, minAvailableMb: 512 }).admission.admit(2));
    await expect(setup({ availableMb: 512, minAvailableMb: 512 }).admission.admit(2)).resolves.toMatchObject({ memoryMb: 512 });
  });

  it("refuses the game over the limit of active games (R8)", async () => {
    await expect(setup({ active: 2 }).admission.admit(2)).resolves.toMatchObject({ level: 2 });
    await refusal(setup({ active: 3 }).admission.admit(2));
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toMatchObject({ reason: "busy", activeGames: 3 });
    await refusal(setup({ active: 1, maxActiveGames: 1 }).admission.admit(1));
  });

  it("names no reason to a player", async () => {
    const error = await setup({ active: 3 }).admission.admit(1).catch((e: unknown) => e);
    expect((error as ServiceUnavailableError).data).toBeUndefined();
  });
});

describe("BotAdmission.admitShow (show-mode)", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  async function reason(promise: Promise<unknown>) {
    const error = await promise.catch((e: unknown) => e);
    await refusal(Promise.reject(error));
    return (error as ServiceUnavailableError).data;
  }

  it("freezes one reading of the memory in both bots and counts the show once", async () => {
    const { admission, execute, read } = setup({ availableMb: 1892 });
    await expect(admission.admitShow([1, 2])).resolves.toEqual([
      { level: 1, memoryMb: null, depthCap: null },
      { level: 2, memoryMb: 1892, depthCap: 10 },
    ]);
    expect(read).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("refuses with the reason for the administrator", async () => {
    expect(await reason(setup({ enabled: false }).admission.admitShow([1, 1]))).toEqual({ reason: "disabled" });
    expect(await reason(setup({ availableMb: 255 }).admission.admitShow([1, 1]))).toEqual({ reason: "memory" });
    // A minimum below the lowest tier still refuses a memory without a tier.
    expect(await reason(setup({ availableMb: 200, minAvailableMb: 100 }).admission.admitShow([2, 1]))).toEqual({ reason: "memory" });
    expect(await reason(setup({ active: 3 }).admission.admitShow([1, 1]))).toEqual({ reason: "busy" });
    expect(warn.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])).reason)).toEqual(["memory", "memory", "busy"]);
  });
});

describe("BotAdmission.inspect", () => {
  it("reports the flag, the memory and the games with the bot without refusing", async () => {
    const { admission } = setup({ enabled: false, availableMb: 100, active: 5, maxActiveGames: 3, minAvailableMb: 256 });
    await expect(admission.inspect()).resolves.toEqual({
      enabled: false,
      availableMb: 100,
      minAvailableMb: 256,
      activeGames: 5,
      maxActiveGames: 3,
    });
  });
});

describe("refuse", () => {
  it("does not log a refusal by a switch", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(refuseBot("level2_not_allowed", {}, true).data).toEqual({ reason: "level2_not_allowed" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
