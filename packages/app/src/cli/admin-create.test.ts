import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterruptedError, type Prompter } from "./terminal-input";

const { find, provision } = vi.hoisted(() => ({ find: vi.fn(), provision: vi.fn() }));
vi.mock("../server/services/auth/admin-account-service", () => ({
  AdminAccountService: vi.fn(function () {
    return { find, provision };
  }),
}));

const sessionDeps = vi.hoisted(() => ({ value: undefined as { hasActiveGame: () => Promise<boolean> } | undefined }));
vi.mock("../server/services/auth/session-service", () => ({
  SessionService: vi.fn(function (deps: { hasActiveGame: () => Promise<boolean> }) {
    sessionDeps.value = deps;
    return {};
  }),
}));

import { describeDatabaseTarget, parseAdminCreateArgs, runAdminCreate } from "./admin-create";

const ENV = {
  ADMIN_EMAIL: " Admin@Example.com ",
  PASSWORD_HASH_COST: "4",
  DATABASE_URL: "postgres://user:secret@db.internal:5433/gomoku",
};

function prompter(answers: (string | undefined | Error)[], interactive: boolean): Prompter & { labels: string[] } {
  const labels: string[] = [];
  return {
    interactive,
    labels,
    ask: vi.fn(async (label: string) => {
      labels.push(label);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
  };
}

function setup(over: { argv?: string[]; answers?: (string | undefined | Error)[]; interactive?: boolean; env?: Record<string, string | undefined>; createOrm?: unknown } = {}) {
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  const close = vi.fn(async () => undefined);
  const orm = { em: { fork: vi.fn(() => ({})) }, close };
  const createOrm = over.createOrm ?? vi.fn(async () => orm);
  const p = prompter(over.answers ?? ["Tajne-haslo-1"], over.interactive ?? false);
  const run = () =>
    runAdminCreate({
      env: over.env ?? ENV,
      argv: over.argv ?? ["--name", "Szef"],
      prompter: p,
      stdout,
      stderr,
      createOrm: createOrm as never,
    });
  const err = () => stderr.write.mock.calls.map(([text]) => text).join("");
  return { run, stdout, stderr, close, createOrm, p, err };
}

beforeEach(() => {
  find.mockReset().mockResolvedValue(null);
  provision.mockReset().mockResolvedValue({ action: "created", userId: "u-1", revokedSessions: 0 });
});

describe("parseAdminCreateArgs", () => {
  it("reads --name (both forms) and --yes", () => {
    expect(parseAdminCreateArgs([])).toEqual({ yes: false });
    expect(parseAdminCreateArgs(["--name", "Ala", "--yes"])).toEqual({ name: "Ala", yes: true });
    expect(parseAdminCreateArgs(["--name=Ola"])).toEqual({ name: "Ola", yes: false });
  });

  it("rejects an unknown argument and a --name without value", () => {
    expect(parseAdminCreateArgs(["--password=x"])).toEqual({ error: "Nieznany argument: --password=x." });
    expect(parseAdminCreateArgs(["--name"])).toEqual({ error: "Flaga --name wymaga wartości." });
  });
});

describe("describeDatabaseTarget", () => {
  it("shows host, port and database without credentials", () => {
    expect(describeDatabaseTarget(ENV.DATABASE_URL)).toBe("db.internal:5433/gomoku");
    expect(describeDatabaseTarget(undefined)).toContain("nieustawiona");
    expect(describeDatabaseTarget("not a url")).toContain("nieczytelna");
  });
});

describe("runAdminCreate", () => {
  it("creates the account from a piped password and prints a line without secrets", async () => {
    const s = setup();

    await expect(s.run()).resolves.toBe(0);

    expect(provision).toHaveBeenCalledWith({
      email: "admin@example.com",
      displayName: "Szef",
      passwordHash: expect.stringMatching(/^\$2[aby]\$04\$/),
    });
    const printed = s.stdout.write.mock.calls[0]![0] as string;
    expect(JSON.parse(printed)).toEqual({ ok: true, action: "created", userId: "u-1", revokedSessions: 0 });
    expect(printed).not.toContain("Tajne");
    expect(s.err()).toContain("db.internal:5433/gomoku");
    expect(s.err()).not.toContain("secret");
    expect(s.createOrm).toHaveBeenCalledWith({ ensureDatabase: false, pool: { min: 0, max: 1 } });
    expect(s.close).toHaveBeenCalledOnce();
  });

  it("never keeps a session alive for a game: revoking ignores active games", async () => {
    await setup().run();
    await expect(sessionDeps.value!.hasActiveGame()).resolves.toBe(false);
  });

  it("asks for the name on a terminal when --name is missing", async () => {
    const s = setup({ argv: [], interactive: true, answers: ["Tajne-haslo-1", "Tajne-haslo-1", "Szef_1"] });
    await expect(s.run()).resolves.toBe(0);
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Szef_1" }));
    expect(s.p.labels).toEqual(["Hasło administratora: ", "Powtórz hasło: ", "Nazwa gracza: "]);
  });

  it.each([
    ["no input", [undefined], "Brak nazwy gracza"],
    ["a bad name", ["a b"], "Nazwa gracza"],
  ])("fails on a terminal with %s for the name", async (_label, name, message) => {
    const s = setup({ argv: [], interactive: true, answers: ["Tajne-haslo-1", "Tajne-haslo-1", ...name] });
    await expect(s.run()).resolves.toBe(1);
    expect(s.err()).toContain(message);
    expect(provision).not.toHaveBeenCalled();
  });

  it("needs --name without a terminal", async () => {
    const s = setup({ argv: [] });
    await expect(s.run()).resolves.toBe(1);
    expect(s.err()).toContain("--name");
  });

  it.each([
    ["no ADMIN_EMAIL", { ...ENV, ADMIN_EMAIL: undefined }, "ADMIN_EMAIL"],
    ["a bad ADMIN_EMAIL", { ...ENV, ADMIN_EMAIL: "x" }, "valid e-mail"],
    ["a bad PASSWORD_HASH_COST", { ...ENV, PASSWORD_HASH_COST: "99" }, "PASSWORD_HASH_COST"],
  ])("fails with %s", async (_label, env, message) => {
    const s = setup({ env });
    await expect(s.run()).resolves.toBe(1);
    expect(s.err()).toContain(message);
    expect(s.createOrm).not.toHaveBeenCalled();
  });

  it("fails on an unknown argument and a bad --name before touching the database", async () => {
    for (const argv of [["--password", "x"], ["--name", "a b"]]) {
      const s = setup({ argv });
      await expect(s.run()).resolves.toBe(1);
      expect(s.createOrm).not.toHaveBeenCalled();
    }
  });

  it("rejects a short piped password and an empty input", async () => {
    const short = setup({ answers: ["krotkie"] });
    await expect(short.run()).resolves.toBe(1);
    expect(short.err()).toContain("co najmniej 8");

    const empty = setup({ answers: [undefined] });
    await expect(empty.run()).resolves.toBe(1);
    expect(empty.err()).toContain("Brak hasła");
  });

  it("asks again on a terminal when the entries differ or are too short, then gives up", async () => {
    const ok = setup({ interactive: true, answers: ["krotkie", "", "Tajne-haslo-1", "inne-haslo-22", "", "Tajne-haslo-1", "Tajne-haslo-1"] });
    await expect(ok.run()).resolves.toBe(0);

    const bad = setup({ interactive: true, answers: ["krotkie", "", "krotkie", "", "krotkie"] });
    await expect(bad.run()).resolves.toBe(1);
    expect(bad.err()).toContain("co najmniej 8");
    expect(provision).toHaveBeenCalledTimes(1);

    const differ = setup({ interactive: true, answers: ["Tajne-haslo-1", "a", "", "Tajne-haslo-1", "b", "", "Tajne-haslo-1", "c"] });
    await expect(differ.run()).resolves.toBe(1);
    expect(differ.err()).toContain("Hasła się różnią");
  });

  describe("an existing account", () => {
    beforeEach(() => {
      find.mockResolvedValue({ displayName: "Obcy", createdAt: "2026-10-01T00:00:00.000Z" });
      provision.mockResolvedValue({ action: "taken_over", userId: "u-2", revokedSessions: 2 });
    });

    it("takes over with --yes and warns when --name differs", async () => {
      const s = setup({ argv: ["--yes", "--name", "Szef"] });
      await expect(s.run()).resolves.toBe(0);
      expect(s.err()).toContain("zostaje przy nazwie „Obcy”");
      expect(JSON.parse(s.stdout.write.mock.calls[0]![0] as string)).toMatchObject({ action: "taken_over", revokedSessions: 2 });
      expect(provision).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Szef" }));
    });

    it("does not warn when the name is the same or not given", async () => {
      for (const argv of [["--yes", "--name", "Obcy"], ["--yes"]]) {
        const s = setup({ argv });
        await expect(s.run()).resolves.toBe(0);
        expect(s.err()).not.toContain("Uwaga");
      }
    });

    it("refuses without a terminal and without --yes", async () => {
      const s = setup({ argv: [] });
      await expect(s.run()).resolves.toBe(1);
      expect(s.err()).toContain("--yes");
      expect(provision).not.toHaveBeenCalled();
    });

    it.each(["t", "TAK", " y "])("asks and takes over on %j", async (answer) => {
      const s = setup({ argv: [], interactive: true, answers: ["Tajne-haslo-1", "Tajne-haslo-1", answer] });
      await expect(s.run()).resolves.toBe(0);
      expect(s.p.labels.at(-1)).toContain("Obcy");
    });

    it.each([["n"], [""], [undefined]])("cancels on %j", async (answer) => {
      const s = setup({ argv: [], interactive: true, answers: ["Tajne-haslo-1", "Tajne-haslo-1", answer] });
      await expect(s.run()).resolves.toBe(1);
      expect(s.err()).toContain("Anulowano");
      expect(provision).not.toHaveBeenCalled();
    });
  });

  it("reports Ctrl+C with code 130 and closes the ORM", async () => {
    const s = setup({ interactive: true, answers: ["Tajne-haslo-1", "Tajne-haslo-1", new InterruptedError()], argv: [] });
    await expect(s.run()).resolves.toBe(130);
    expect(s.err()).toContain("Przerwano.");
    expect(s.close).toHaveBeenCalledOnce();
  });

  it("shows the message of an application error (e.g. a taken name)", async () => {
    const { ValidationError } = await import("@gomoku/core");
    provision.mockRejectedValue(new ValidationError("Nazwa gracza jest już zajęta.", { code: "DISPLAY_NAME_TAKEN" }));
    const s = setup();
    await expect(s.run()).resolves.toBe(1);
    expect(s.err()).toContain("Nazwa gracza jest już zajęta.");
    expect(s.close).toHaveBeenCalledOnce();
  });

  it("shows only the class and code of an unknown error, never its message", async () => {
    const withCode = setup({
      createOrm: vi.fn(async () => Promise.reject(Object.assign(new Error("connect postgres://u:pw@h/db failed"), { code: "ECONNREFUSED" }))),
    });
    await expect(withCode.run()).resolves.toBe(1);
    expect(withCode.err()).toContain("Nieoczekiwany błąd (Error ECONNREFUSED).");
    expect(withCode.err()).not.toContain("pw@");

    const plain = setup({ createOrm: vi.fn(async () => Promise.reject(new TypeError("x"))) });
    await expect(plain.run()).resolves.toBe(1);
    expect(plain.err()).toContain("Nieoczekiwany błąd (TypeError).");
  });
});
