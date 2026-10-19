import { describe, expect, it } from "vitest";

import { fakeContext } from "../test-helpers";
import { parseMinimumVersion, requirements, satisfies } from "./requirements.mjs";

const withEngines = (node: unknown, nodeVersion = "22.23.3") =>
  fakeContext({ files: { "package.json": JSON.stringify({ engines: { node } }) }, deps: { nodeVersion } }).ctx;

describe("parseMinimumVersion", () => {
  it("accepts >=MAJOR.MINOR[.PATCH]", () => {
    expect(parseMinimumVersion(">=22.17")).toEqual([22, 17, 0]);
    expect(parseMinimumVersion(" >= 22.17.1 ")).toEqual([22, 17, 1]);
  });

  it("rejects any other form", () => {
    expect(parseMinimumVersion("^22.17 || >=24")).toBeUndefined();
    expect(parseMinimumVersion("22")).toBeUndefined();
  });
});

describe("satisfies", () => {
  it("compares major, minor and patch", () => {
    expect(satisfies("22.17.0", [22, 17, 0])).toBe(true);
    expect(satisfies("24.0.0", [22, 17, 0])).toBe(true);
    expect(satisfies("22.16.9", [22, 17, 0])).toBe(false);
    expect(satisfies("22.17.0", [22, 17, 1])).toBe(false);
    expect(satisfies("22.17", [22, 17])).toBe(true);
  });
});

describe("requirements step", () => {
  it("passes on a supported Node version", async () => {
    await expect(requirements.run(withEngines(">=22.17"))).resolves.toEqual({
      status: "done",
      detail: "Node 22.23.3 (wymagane >=22.17)",
    });
  });

  it("fails on an older Node version", async () => {
    await expect(requirements.run(withEngines(">=22.17", "20.11.0"))).resolves.toMatchObject({
      status: "failed",
      detail: "Node 20.11.0, wymagane >=22.17",
    });
  });

  it("fails on an engines range it cannot evaluate", async () => {
    await expect(requirements.run(withEngines("^22.17 || >=24"))).resolves.toMatchObject({
      status: "failed",
      detail: 'nieobsługiwany format engines.node: "^22.17 || >=24"',
    });
    const noEngines = fakeContext({ files: { "package.json": "{}" } }).ctx;
    await expect(requirements.run(noEngines)).resolves.toMatchObject({ status: "failed" });
  });
});
