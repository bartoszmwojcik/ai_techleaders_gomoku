import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PasswordHasher } from "./password-hasher";

const hasher = new PasswordHasher({ passwordHashCost: 4 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PasswordHasher", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hasher.hash("correct horse");

    expect(hash).not.toContain("correct horse");
    await expect(hasher.verify("correct horse", hash)).resolves.toBe(true);
    await expect(hasher.verify("wrong horse", hash)).resolves.toBe(false);
  });

  it("encodes the injected cost in the hash", async () => {
    const low = await new PasswordHasher({ passwordHashCost: 4 }).hash("secret123");
    const high = await new PasswordHasher({ passwordHashCost: 5 }).hash("secret123");

    expect(low).toMatch(/^\$2[aby]\$04\$/);
    expect(high).toMatch(/^\$2[aby]\$05\$/);
  });

  it("salts every hash", async () => {
    expect(await hasher.hash("same")).not.toBe(await hasher.hash("same"));
  });

  it("uses only the asynchronous bcrypt API and returns promises", async () => {
    const syncHash = vi.spyOn(bcrypt, "hashSync");
    const syncCompare = vi.spyOn(bcrypt, "compareSync");

    const pending = hasher.hash("secret123");
    expect(pending).toBeInstanceOf(Promise);
    const hash = await pending;
    const check = hasher.verify("secret123", hash);
    expect(check).toBeInstanceOf(Promise);
    await check;

    expect(syncHash).not.toHaveBeenCalled();
    expect(syncCompare).not.toHaveBeenCalled();
  });

  it("does not block the event loop while hashing", async () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 0);

    await new PasswordHasher({ passwordHashCost: 10 }).hash("secret123");
    clearInterval(timer);

    expect(ticks).toBeGreaterThan(0);
  });
});
