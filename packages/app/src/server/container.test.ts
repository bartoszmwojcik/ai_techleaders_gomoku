import type { Orm } from "@gomoku/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createOrm, entities } = vi.hoisted(() => ({
  createOrm: vi.fn(),
  entities: [] as unknown[],
}));
vi.mock("@gomoku/db", () => ({ createOrm, entities }));

const globalForOrm = globalThis as typeof globalThis & {
  __gomokuOrms?: WeakMap<object, Promise<Orm>>;
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
  delete globalForOrm.__gomokuOrms;
});

afterEach(() => {
  delete globalForOrm.__gomokuOrms;
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
    globalForOrm.__gomokuOrms = new WeakMap([[entities, Promise.resolve(orm)]]);
    const { getContainer } = await loadContainer();

    const container = await getContainer();

    expect(container.cradle.orm).toBe(orm);
    expect(createOrm).not.toHaveBeenCalled();
  });

  it("creates a separate ORM for a separate copy of the entities (page and route layers)", async () => {
    const pageOrm = fakeOrm().orm;
    const routeOrm = fakeOrm().orm;
    createOrm.mockResolvedValueOnce(pageOrm).mockResolvedValueOnce(routeOrm);
    const { getContainer: forPages } = await loadContainer();
    expect((await forPages()).cradle.orm).toBe(pageOrm);

    vi.resetModules();
    vi.doMock("@gomoku/db", () => ({ createOrm, entities: [] }));
    const { getContainer: forRoutes } = await loadContainer();
    vi.doMock("@gomoku/db", () => ({ createOrm, entities }));

    expect((await forRoutes()).cradle.orm).toBe(routeOrm);
    expect(createOrm).toHaveBeenCalledTimes(2);
  });

  it("retries on the next call when creating the ORM fails", async () => {
    const { orm } = fakeOrm();
    createOrm
      .mockRejectedValueOnce(new Error("database unreachable"))
      .mockResolvedValueOnce(orm);
    const { getContainer } = await loadContainer();

    await expect(getContainer()).rejects.toThrow("database unreachable");
    expect(globalForOrm.__gomokuOrms?.has(entities)).toBe(false);

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
      expect(cradle.userService).toBe(cradle.userService);
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

  it("takes the bcrypt cost from PASSWORD_HASH_COST", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("PASSWORD_HASH_COST", "4");
    const { getContainer } = await loadContainer();

    const container = await getContainer();

    expect(container.cradle.passwordHashCost).toBe(4);
    expect(await container.cradle.passwordHasher.hash("secret123")).toMatch(
      /^\$2[aby]\$04\$/,
    );
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
