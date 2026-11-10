import { afterEach, describe, expect, it, vi } from "vitest";

import { createTranslator, isPlural, reportTextProblem, type Catalog, type Dict, type MessageKey } from "./translator";

const pl = {
  greeting: "Cześć, {name}!",
  plain: "Gomoku",
  chat: {
    unread: { one: "{count} nowa", few: "{count} nowe", many: "{count} nowych", other: "{count} nowej" },
  },
  nested: { deeper: { text: "głęboko" } },
} satisfies Dict;

const fr: Catalog<typeof pl> = {
  greeting: "Bonjour, {name} !",
  plain: "Gomoku",
  chat: { unread: { one: "{count} nouveau", many: "{count} de nouveaux", other: "{count} nouveaux" } },
  nested: { deeper: { text: "profond" } },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTranslator", () => {
  const t = createTranslator("pl", pl);

  it("fills in parameters and reads nested keys", () => {
    expect(t("greeting", { name: "Ala" })).toBe("Cześć, Ala!");
    expect(t("plain")).toBe("Gomoku");
    expect(t("nested.deeper.text")).toBe("głęboko");
    expect(t.locale).toBe("pl");
  });

  it.each([
    [1, "1 nowa"],
    [2, "2 nowe"],
    [5, "5 nowych"],
    [22, "22 nowe"],
    [25, "25 nowych"],
    [1.5, "1.5 nowej"],
  ])("picks the Polish plural form for %d", (count, expected) => {
    expect(t("chat.unread", { count })).toBe(expected);
  });

  it("uses French many for large numbers and other when a form is missing", () => {
    const tf = createTranslator("fr", fr);
    expect(tf("chat.unread", { count: 1 })).toBe("1 nouveau");
    expect(tf("chat.unread", { count: 1_000_000 })).toBe("1000000 de nouveaux");
    expect(tf("chat.unread", { count: 3 })).toBe("3 nouveaux");

    const sparse = createTranslator("pl", { n: { other: "{count} sztuk" } });
    expect(sparse("n", { count: 1 })).toBe("1 sztuk");
  });

  it("formats numbers and megabytes in the language", () => {
    expect(createTranslator("fr", fr).megabytes(16)).toBe("16\u202fMo");
    expect(t.megabytes(16)).toBe("16 MB");
    expect(createTranslator("en", pl).number(1234.5)).toBe("1,234.5");
    expect(t.number(0.5, { style: "percent" })).toBe("50%");
  });

  it("fails a test on a missing parameter, a missing count and a missing key", () => {
    expect(() => t("greeting")).toThrow('"greeting" has no value for {name} (pl)');
    expect(() => t("chat.unread")).toThrow('"chat.unread" needs a numeric {count} (pl)');
    const loose = createTranslator("pl", pl as Dict);
    for (const key of ["missing", "nested", "nested.deeper", "plain.x", "chat.unread.one", "missing.deeper.x"]) {
      expect(() => loose(key as MessageKey<Dict>)).toThrow(`missing text "${key}" (pl)`);
    }
  });

  it("shows the key or the literal parameter outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const loose = createTranslator("pl", pl as Dict);

    expect(t("greeting")).toBe("Cześć, {name}!");
    expect(t("chat.unread", { count: "x" })).toBe("x nowej");
    expect(loose("gone" as MessageKey<Dict>)).toBe("gone");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("reportTextProblem", () => {
  it("warns once per problem in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportTextProblem("only once");
    reportTextProblem("only once");
    reportTextProblem("another");

    expect(warn.mock.calls).toEqual([["[i18n] only once"], ["[i18n] another"]]);
  });
});

describe("isPlural", () => {
  it("tells plural forms from strings and nested groups", () => {
    expect(isPlural("text")).toBe(false);
    expect(isPlural({ one: "a", other: "b" })).toBe(true);
    expect(isPlural({ other: "b", label: "c" })).toBe(false);
    expect(isPlural({ one: "a" } as Dict)).toBe(false);
  });
});
