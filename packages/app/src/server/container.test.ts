import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Orm } from "@gomoku/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createOrm, entities, PasswordResetToken, GamePlayer } = vi.hoisted(
  () => ({
    createOrm: vi.fn(),
    entities: [] as unknown[],
    PasswordResetToken: { name: "PasswordResetToken" },
    GamePlayer: { name: "GamePlayer" },
  }),
);
vi.mock("@gomoku/db", () => ({
  createOrm,
  entities,
  PasswordResetToken,
  GamePlayer,
}));

const globalForOrm = globalThis as typeof globalThis & {
  __gomokuOrms?: WeakMap<object, Promise<Orm>>;
};

function fakeOrm() {
  const forkedEm = {
    id: "forked",
    count: vi.fn(async () => 0),
    execute: vi.fn(async () => []),
  };
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
    vi.doMock("@gomoku/db", () => ({
      createOrm,
      entities: [],
      PasswordResetToken,
      GamePlayer,
    }));
    const { getContainer: forRoutes } = await loadContainer();
    vi.doMock("@gomoku/db", () => ({
      createOrm,
      entities,
      PasswordResetToken,
      GamePlayer,
    }));

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
      expect(cradle.accountService).toBe(cradle.accountService);
      expect(cradle.emailVerificationService).toBe(
        cradle.emailVerificationService,
      );
      expect(cradle.gameParticipation).toBe(cradle.gameParticipation);
      expect(await cradle.gameParticipation.hasActiveGame("user")).toBe(false);
      const expiredAt = new Date("2026-10-27T11:00:00Z");
      expect(await cradle.hasActiveGame("user", expiredAt)).toBe(false);
      expect(forkedEm.count).toHaveBeenLastCalledWith(
        GamePlayer,
        expect.objectContaining({ user: "user", isActive: true }),
      );
      expect(cradle.gameService).toBe(cradle.gameService);
      expect(cradle.gameMoveService).toBe(cradle.gameMoveService);
      expect(cradle.invitationCodes).toBe(cradle.invitationCodes);
      expect(cradle.colorDraw).toBe(cradle.colorDraw);
      expect(cradle.invitationService).toBe(cradle.invitationService);
      expect(await cradle.timeoutSettler.settleFor("user")).toBeUndefined();
      expect(cradle.passwordResetService).toBe(cradle.passwordResetService);
      const nativeUpdate = vi.fn(async () => 1);
      await cradle.invalidateResetTokens("user", { nativeUpdate } as never);
      expect(nativeUpdate).toHaveBeenCalledWith(
        PasswordResetToken,
        { user: "user", usedAt: null },
        { usedAt: expect.any(Date) },
      );
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

describe("email sender", () => {
  it("uses the unconfigured sender without EMAIL_TRANSPORT and provides the clock", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("EMAIL_TRANSPORT", "");
    const { getContainer } = await loadContainer();

    const { cradle } = await getContainer();

    expect(cradle.clock.now()).toBeInstanceOf(Date);
    await expect(
      cradle.emailSender.send({
        to: "a@b.c",
        subject: "s",
        text: "t",
        html: "h",
      }),
    ).rejects.toThrow(/EMAIL_TRANSPORT/);
  });

  it("uses the file sender for EMAIL_TRANSPORT=file", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    const dir = await mkdtemp(join(tmpdir(), "outbox-"));
    const outbox = join(dir, "out.jsonl");
    vi.stubEnv("EMAIL_TRANSPORT", "file");
    vi.stubEnv("EMAIL_OUTBOX_PATH", outbox);
    vi.stubEnv("EMAIL_FROM", "Gomoku");
    const { getContainer } = await loadContainer();

    const { cradle } = await getContainer();
    await cradle.emailSender.send({
      to: "a@b.c",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(JSON.parse((await readFile(outbox, "utf8")).trim())).toMatchObject({
      to: "a@b.c",
      from: "Gomoku",
    });
    await rm(dir, { recursive: true });
  });

  it("uses the Brevo sender with the global fetch for EMAIL_TRANSPORT=brevo", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("EMAIL_TRANSPORT", "brevo");
    vi.stubEnv("BREVO_API_KEY", "k");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "gra@example.com");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getContainer } = await loadContainer();

    const { cradle } = await getContainer();
    await cradle.emailSender.send({
      to: "a@b.c",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.any(Object),
    );
  });

  it("uses the failing sender, with a warning, when brevo lacks its key", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("EMAIL_TRANSPORT", "brevo");
    vi.stubEnv("BREVO_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getContainer } = await loadContainer();

    const { cradle } = await getContainer();

    await expect(
      cradle.emailSender.send({
        to: "a@b.c",
        subject: "s",
        text: "t",
        html: "h",
      }),
    ).rejects.toThrow(/EMAIL_TRANSPORT/);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("fails only the email sender on a bad EMAIL_TRANSPORT", async () => {
    const { orm } = fakeOrm();
    createOrm.mockResolvedValue(orm);
    vi.stubEnv("EMAIL_TRANSPORT", "carrier-pigeon");
    const { getContainer } = await loadContainer();

    const { cradle } = await getContainer();

    expect(cradle.orm).toBe(orm);
    expect(() => cradle.emailSender).toThrow(/EMAIL_TRANSPORT/);
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
