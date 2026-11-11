import { describe, expect, it } from "vitest";

import { EXPORT_COLUMNS, exportRows, flatten, namespacesOf, paramsOf, statusText, toCsv, type ExportCatalogs } from "./i18n-export";

const draft = { state: "draft" } as const;
const reviewed = { state: "reviewed", reviewer: "Marie", date: "2026-11-12" } as const;

describe("flatten", () => {
  it("gives every text by its dotted key, a plural form one per category", () => {
    const texts = flatten({ a: "A", group: { b: "B {x}", inner: { c: "C" } }, count: { one: "{n} ruch", few: "{n} ruchy", other: "{n} ruchu" } });
    expect([...texts]).toEqual([
      ["a", "A"],
      ["group.b", "B {x}"],
      ["group.inner.c", "C"],
      ["count[one]", "{n} ruch"],
      ["count[few]", "{n} ruchy"],
      ["count[other]", "{n} ruchu"],
    ]);
  });
});

describe("paramsOf", () => {
  it("lists the parameters in order, each once", () => {
    expect(paramsOf("Bot · {level} · {table} ({level})")).toEqual(["level", "table"]);
    expect(paramsOf("Bez parametrów")).toEqual([]);
  });
});

describe("statusText (I17)", () => {
  it("names a draft, and a review with its reviewer and day", () => {
    expect(statusText("fr", draft)).toBe("fr: draft");
    expect(statusText("fr", reviewed)).toBe("fr: reviewed (Marie, 2026-11-12)");
  });
});

describe("exportRows", () => {
  const catalogs = {
    show: {
      pl: { title: "Pokaz {n}", only: "Tylko PL" },
      en: { title: "Show {n}", only: "Only" },
      fr: { title: "Démonstration {n}", only: "Seul" },
      de: { title: "Vorführung {n}" },
    },
    header: { pl: { x: "X" }, en: { x: "X" }, fr: { x: "X" }, de: {} },
  } as unknown as ExportCatalogs;
  const status = {
    en: { common: draft, header: draft, show: draft },
    fr: { common: draft, header: draft, show: reviewed },
    de: { common: draft, header: draft, show: draft },
  };

  it("gives one row per Polish text with every language, the statuses and the parameters; a gap stays empty", () => {
    expect(exportRows(catalogs, status, ["show"])).toEqual([
      {
        key: "show.title",
        pl: "Pokaz {n}",
        en: "Show {n}",
        fr: "Démonstration {n}",
        de: "Vorführung {n}",
        status: "en: draft; fr: reviewed (Marie, 2026-11-12); de: draft",
        params: "n",
      },
      { key: "show.only", pl: "Tylko PL", en: "Only", fr: "Seul", de: "", status: "en: draft; fr: reviewed (Marie, 2026-11-12); de: draft", params: "" },
    ]);
  });

  it("keeps the order of the namespaces asked for", () => {
    expect(exportRows(catalogs, status, ["header", "show"]).map((row) => row.key)).toEqual(["header.x", "show.title", "show.only"]);
  });
});

describe("toCsv", () => {
  it("writes the header and the rows with CRLF and a byte order mark, quoting what needs it", () => {
    const csv = toCsv([{ key: "k", pl: 'Powiedz "tak", proszę', en: "line\nbreak", fr: "Démonstration : x", de: "", status: "s", params: "a, b" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      EXPORT_COLUMNS.join(","),
      'k,"Powiedz ""tak"", proszę","line\nbreak",Démonstration : x,,s,"a, b"',
      "",
    ]);
    expect(EXPORT_COLUMNS).toEqual(["key", "PL", "EN", "FR", "DE", "status", "params"]);
  });
});

describe("namespacesOf (--ns)", () => {
  const all = ["common", "header", "show"] as const;

  it("gives every namespace by default and the ones asked for otherwise", () => {
    expect(namespacesOf(undefined, all)).toEqual(["common", "header", "show"]);
    expect(namespacesOf("", all)).toEqual(["common", "header", "show"]);
    expect(namespacesOf("show, header", all)).toEqual(["show", "header"]);
  });

  it("refuses an unknown namespace", () => {
    expect(() => namespacesOf("show,lobby", all)).toThrow("Unknown namespace: lobby (known: common, header, show)");
  });
});
