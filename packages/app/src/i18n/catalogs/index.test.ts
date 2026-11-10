import { afterEach, describe, expect, it, vi } from "vitest";

import { LOADERS, loadNamespace, mergeFallback } from "./index";
import enCommon from "./en/common";
import enHeader from "./en/header";
import frHeader from "./fr/header";
import plHeader from "./pl/header";
import plCommon from "./pl/common";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mergeFallback", () => {
  it("fills gaps from the base, takes plural forms whole and keeps the base shape on a mismatch", () => {
    const missing: string[] = [];
    const merged = mergeFallback(
      { a: "A", group: { b: "B" }, count: { one: "one", other: "other" }, wrong: "text" },
      {
        a: "a",
        group: { b: "b", c: "c" },
        count: { one: "1", few: "2", many: "5", other: "x" },
        wrong: { d: "d" },
        gone: "g",
        plural: { other: "p" },
      },
      missing,
    );

    expect(merged).toEqual({
      a: "A",
      group: { b: "B", c: "c" },
      count: { one: "one", other: "other" },
      wrong: { d: "d" },
      gone: "g",
      plural: { other: "p" },
    });
    expect(missing).toEqual(["group.c", "wrong", "gone", "plural"]);
  });

  it("ignores keys the base does not have", () => {
    expect(mergeFallback({ extra: "x", a: "A" }, { a: "a" }, [])).toEqual({ a: "A" });
  });
});

describe("loadNamespace", () => {
  it("returns Polish as it is", async () => {
    expect(await loadNamespace("pl", "header")).toEqual(plHeader);
    expect(await loadNamespace("pl", "common")).toEqual(plCommon);
  });

  it("returns complete English and French", async () => {
    expect(await loadNamespace("en", "header")).toEqual(enHeader);
    expect(await loadNamespace("fr", "header")).toEqual(frHeader);
  });

  it("fills German through English, then Polish, and warns once per key in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const de = await loadNamespace("de", "header");
    await loadNamespace("de", "header");

    expect(de.theme.light).toBe("Helles Design");
    expect(de.session.history).toBe(enHeader.session.history);
    expect(de.logout).toEqual(enHeader.logout);
    expect(warn).toHaveBeenCalledWith('[i18n] de lacks "header.session.history", showing the fallback');
    const historyWarnings = warn.mock.calls.filter(([text]) => String(text).includes("header.session.history"));
    expect(historyWarnings).toHaveLength(1);
  });

  it("is quiet outside development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const de = await loadNamespace("de", "common");

    expect(de).toEqual(enCommon);
    expect(Object.keys(LOADERS)).toEqual(["pl", "en", "fr", "de"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("only reports what the requested language itself lacks", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await loadNamespace("fr", "header");

    expect(warn).not.toHaveBeenCalled();
  });
});
