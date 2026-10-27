import type { Orm } from "@gomoku/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createOrm } = vi.hoisted(() => ({ createOrm: vi.fn() }));
vi.mock("@gomoku/db", () => ({ createOrm }));

const globalForOrm = globalThis as typeof globalThis & {
  __gomokuOrm?: Promise<Orm>;
};

function fakeOrm() {
  const forkedEm = { id: "forked" };
  const orm = { em: { fork: vi.fn(() => forkedEm) } } as unknown as Orm;
  return { orm, forkedEm };
}

// Each test loads a fresh module graph, like a new server process. HealthService is
// imported from the same graph so that `instanceof` compares the same class.
async function loadContainer() {
  const [container, { HealthService }] = await Promise.all([
    import("./container"),
    import("./services/health-service"),
  ]);
  return { ...container, HealthService };
}

beforeEach(() => {
  vi.resetModules();
  createOrm.mockReset();
  delete globalForOrm.__gomokuOrm;
});

afterEach(() => {
  delete globalForOrm.__gomokuOrm;
});

describe("getContainer", () => {
  it("builds the container once and registers the ORM and services", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    const { getContainer, HealthService } = await loadContainer();

    const [first, second] = await Promise.all([getContainer(), getContainer()]);

    expect(first).toBe(second);
    expect(createOrm).toHaveBeenCalledOnce();
    expect(first.cradle.orm).toBe(orm);
    expect(first.cradle.healthService).toBeInstanceOf(HealthService);
    expect(first.cradle.healthService).toBe(first.cradle.healthService);
    expect(first.cradle.passwordHashCost).toBe(12);
    expect(first.cradle.passwordHasher).toBe(first.cradle.passwordHasher);
    expect(await first.cradle.passwordHasher.hash("secret123")).toMatch(
      /^\$2[aby]\$12\$/,
    );
  });

  it("reuses the ORM cached on globalThis across module reloads (HMR)", async () => {
    const { orm } = fakeOrm();
    globalForOrm.__gomokuOrm = Promise.resolve(orm);
    const { getContainer } = await loadContainer();

    const container = await getContainer();

    expect(container.cradle.orm).toBe(orm);
    expect(createOrm).not.toHaveBeenCalled();
  });

  it("retries on the next call when creating the ORM fails", async () => {
    const { orm } = fakeOrm();
    createOrm
      .mockRejectedValueOnce(new Error("database unreachable"))
      .mockResolvedValueOnce(orm);
    const { getContainer } = await loadContainer();

    await expect(getContainer()).rejects.toThrow("database unreachable");
    expect(globalForOrm.__gomokuOrm).toBeUndefined();

    await expect(getContainer()).resolves.toMatchObject({ cradle: { orm } });
    expect(createOrm).toHaveBeenCalledTimes(2);
  });
});

describe("auth services", () => {
  it("resolves session and rate-limit services in a request scope", async () => {
    const { orm, forkedEm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    const { withRequestScope } = await loadContainer();

    await withRequestScope(async ({ cradle }) => {
      expect(cradle.sessionService).toBe(cradle.sessionService);
      expect(cradle.rateLimiter).toBe(cradle.rateLimiter);
      expect(await cradle.hasActiveGame("user", new Date())).toBe(false);
      expect(forkedEm).toBeDefined();
    });
  });

  it("reads the server configuration lazily so /api/health survives a bad one", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    const { getContainer } = await loadContainer();

    const container = await getContainer();

    expect(container.cradle.orm).toBe(orm);
    expect(() => container.cradle.serverConfig).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("provides the server configuration outside production", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("NODE_ENV", "development");
    const { getContainer } = await loadContainer();

    const container = await getContainer();

    expect(container.cradle.serverConfig.production).toBe(false);
  });
});

describe("withRequestScope", () => {
  it("runs the callback in a scope with its own forked EntityManager", async () => {
    const { orm, forkedEm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    const { withRequestScope, HealthService } = await loadContainer();

    const result = await withRequestScope(async ({ cradle }) => {
      expect(cradle.em).toBe(forkedEm);
      expect(cradle.healthService).toBeInstanceOf(HealthService);
      return "done";
    });

    expect(result).toBe("done");
    expect(orm.em.fork).toHaveBeenCalledOnce();
  });
});
