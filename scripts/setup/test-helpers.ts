// Fakes shared by the installer tests: an in-memory file system and a scripted `run`.
import { vi } from "vitest";

import type { Context, Options } from "./main.mjs";
import type { Deps, RunResult } from "./system.mjs";

export const ROOT = "/repo";

export function ok(stdout = ""): RunResult {
  return { code: 0, stdout, stderr: "", timedOut: false };
}

export function failure(code: number | null, stderr = "", extra: Partial<RunResult> = {}): RunResult {
  return { code, stdout: "", stderr, timedOut: false, ...extra };
}

export function fakeContext({
  files = {},
  env = {},
  options = {},
  deps = {},
}: {
  files?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  options?: Partial<Options>;
  deps?: Partial<Deps>;
} = {}) {
  const store = new Map(Object.entries(files).map(([path, content]) => [`${ROOT}/${path}`, content]));
  const fs = {
    existsSync: vi.fn((path: string) => store.has(path)),
    readFileSync: vi.fn((path: string) => {
      const content = store.get(path);
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      return content;
    }),
    writeFileSync: vi.fn((path: string, content: string) => void store.set(path, content)),
    copyFileSync: vi.fn((from: string, to: string) => void store.set(to, store.get(from)!)),
  };
  const ctx: Context = {
    deps: {
      root: ROOT,
      run: vi.fn(),
      isPortInUse: vi.fn().mockResolvedValue(false),
      fs: fs as unknown as Deps["fs"],
      sleep: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      env,
      nodeVersion: "22.23.3",
      loadNextEnv: vi.fn(),
      ...deps,
    },
    options: { withBrowser: false, dbFromEnv: false, ...options },
    state: {},
  };
  const file = (path: string) => store.get(`${ROOT}/${path}`);
  return { ctx, fs, file, run: ctx.deps.run as ReturnType<typeof vi.fn> };
}
