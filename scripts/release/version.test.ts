import { describe, expect, it } from "vitest";

import { compareVersions, nextVersion, parseVersion } from "./version.mjs";

describe("parseVersion", () => {
  it("reads X.Y.Z", () => {
    expect(parseVersion("1.20.3")).toEqual({ major: 1, minor: 20, patch: 3 });
  });

  it.each(["v1.2.3", "1.2", "1.2.3-rc.1", "1.2.3.4", "", " 1.2.3", "a.b.c"])("rejects %j", (text) => {
    expect(() => parseVersion(text)).toThrow(/Invalid version/);
  });

  it("rejects a missing value", () => {
    expect(() => parseVersion(undefined)).toThrow(/Invalid version "undefined"/);
  });
});

describe("compareVersions", () => {
  const v = parseVersion;
  it("orders by major, minor, then patch", () => {
    expect(compareVersions(v("1.0.0"), v("2.0.0"))).toBe(-1);
    expect(compareVersions(v("1.3.0"), v("1.2.9"))).toBe(1);
    expect(compareVersions(v("1.2.3"), v("1.2.4"))).toBe(-1);
    expect(compareVersions(v("1.2.3"), v("1.2.3"))).toBe(0);
  });
});

describe("nextVersion", () => {
  it("bumps patch, minor and major, resetting the lower parts", () => {
    expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("takes a custom number that is not lower than the current one", () => {
    expect(nextVersion("0.1.0", "custom", "0.1.0")).toBe("0.1.0");
    expect(nextVersion("0.1.0", "custom", "3.0.0")).toBe("3.0.0");
  });

  it("rejects a lower custom number, a malformed one and a missing one", () => {
    expect(() => nextVersion("1.2.3", "custom", "1.2.2")).toThrow(/lower than the current 1\.2\.3/);
    expect(() => nextVersion("1.2.3", "custom", "v2")).toThrow(/Invalid version/);
    expect(() => nextVersion("1.2.3", "custom", "")).toThrow(/Invalid version/);
  });

  it("rejects a custom number given with another bump, an unknown bump and a broken current version", () => {
    expect(() => nextVersion("1.2.3", "minor", "2.0.0")).toThrow(/only used with bump=custom/);
    expect(() => nextVersion("1.2.3", "huge")).toThrow(/Unknown bump "huge"/);
    expect(() => nextVersion("oops", "patch")).toThrow(/Invalid version/);
  });
});
