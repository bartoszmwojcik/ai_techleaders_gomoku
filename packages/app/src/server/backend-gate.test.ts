import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

import { assertBackendEnabled, isBackendEnabled } from "./backend-gate";

describe("isBackendEnabled", () => {
  it("is on in development and tests, off in production", () => {
    expect(isBackendEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isBackendEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(isBackendEnabled({})).toBe(true);
    expect(isBackendEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("assertBackendEnabled", () => {
  it("answers 404 in production", () => {
    expect(() => assertBackendEnabled({ NODE_ENV: "production" })).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("lets the request through outside production", () => {
    notFound.mockClear();

    expect(() => assertBackendEnabled({ NODE_ENV: "development" })).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("reads the process environment by default", () => {
    notFound.mockClear();
    vi.stubEnv("NODE_ENV", "production");

    expect(() => assertBackendEnabled()).toThrow("NEXT_NOT_FOUND");
  });
});

describe("the (backend) route group", () => {
  const root = join(__dirname, "..", "app", "(backend)");
  const entries = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? entries(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  const guarded = entries(root).filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      !/\.test\.tsx?$/.test(file) &&
      (/(^|\/)(page|layout|route)\.tsx?$/.test(file) || /^\s*["']use server["']/m.test(readFileSync(file, "utf8"))),
  );

  it("finds the panel entry points", () => {
    expect(guarded.map((file) => relative(root, file))).toEqual(
      expect.arrayContaining(["layout.tsx", "backend/page.tsx"]),
    );
  });

  it.each(guarded.map((file) => [relative(root, file), file]))(
    "%s calls assertBackendEnabled() (404 in production, #152)",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toMatch(/\bassertBackendEnabled\(\)/);
    },
  );
});
