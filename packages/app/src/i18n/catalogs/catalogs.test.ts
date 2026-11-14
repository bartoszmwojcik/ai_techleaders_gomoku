import type { Dict } from "@gomoku/core/i18n/translator";
import { describe, expect, it } from "vitest";

import deCommon from "./de/common";
import deHeader from "./de/header";
import deShow from "./de/show";
import enCommon from "./en/common";
import enHeader from "./en/header";
import enShow from "./en/show";
import frCommon from "./fr/common";
import frHeader from "./fr/header";
import frShow from "./fr/show";
import deAuth from "./de/auth";
import deHome from "./de/home";
import enAuth from "./en/auth";
import enHome from "./en/home";
import frAuth from "./fr/auth";
import frHome from "./fr/home";
import plAuth from "./pl/auth";
import plHome from "./pl/home";
import deChat from "./de/chat";
import deGame from "./de/game";
import enChat from "./en/chat";
import enGame from "./en/game";
import frChat from "./fr/chat";
import frGame from "./fr/game";
import plChat from "./pl/chat";
import plGame from "./pl/game";
import deHistory from "./de/history";
import deLobby from "./de/lobby";
import deReview from "./de/review";
import enHistory from "./en/history";
import enLobby from "./en/lobby";
import enReview from "./en/review";
import frHistory from "./fr/history";
import frLobby from "./fr/lobby";
import frReview from "./fr/review";
import plHistory from "./pl/history";
import plLobby from "./pl/lobby";
import plReview from "./pl/review";
import deAccount from "./de/account";
import enAccount from "./en/account";
import frAccount from "./fr/account";
import plAccount from "./pl/account";
import deErrors from "./de/errors";
import enErrors from "./en/errors";
import frErrors from "./fr/errors";
import plErrors from "./pl/errors";
import { coverage, flatten, parityProblems } from "./parity";
import plCommon from "./pl/common";
import plHeader from "./pl/header";
import plShow from "./pl/show";
import { CATALOG_STATUS, statusProblems } from "./status";
import { NAMESPACES, type Namespace } from "./types";

const CATALOGS: Record<"pl" | "en" | "fr" | "de", Record<Namespace, Dict>> = {
  pl: { common: plCommon, header: plHeader, show: plShow, home: plHome, auth: plAuth, game: plGame, chat: plChat, lobby: plLobby, history: plHistory, review: plReview, account: plAccount, errors: plErrors },
  en: { common: enCommon, header: enHeader, show: enShow, home: enHome, auth: enAuth, game: enGame, chat: enChat, lobby: enLobby, history: enHistory, review: enReview, account: enAccount, errors: enErrors },
  fr: { common: frCommon, header: frHeader, show: frShow, home: frHome, auth: frAuth, game: frGame, chat: frChat, lobby: frLobby, history: frHistory, review: frReview, account: frAccount, errors: frErrors },
  de: { common: deCommon, header: deHeader, show: deShow, home: deHome, auth: deAuth, game: deGame, chat: deChat, lobby: deLobby, history: deHistory, review: deReview, account: deAccount, errors: deErrors },
};

// Spec I10: English, French and German (a complete machine draft since E15-S08) promise every Polish text.
describe.each(NAMESPACES)("catalog parity: %s", (namespace) => {
  it.each(["en", "fr", "de"] as const)("%s has exactly the Polish keys, parameters and plural forms", (locale) => {
    expect(parityProblems(locale, CATALOGS.pl[namespace], CATALOGS[locale][namespace], { complete: true })).toEqual([]);
    expect(coverage(CATALOGS.pl[namespace], CATALOGS[locale][namespace])).toBe(100);
  });

  it("Polish plural forms are complete", () => {
    expect(parityProblems("pl", CATALOGS.pl[namespace], CATALOGS.pl[namespace], { complete: true })).toEqual([]);
  });
});

describe("review status", () => {
  it("names a reviewer and a day for every reviewed translation", () => {
    for (const [locale, namespaces] of Object.entries(CATALOG_STATUS)) {
      expect(Object.keys(namespaces).sort()).toEqual([...NAMESPACES].sort());
      for (const [namespace, status] of Object.entries(namespaces)) {
        expect(statusProblems(status), `${locale}/${namespace}`).toEqual([]);
        console.info(`[i18n] ${locale}/${namespace}: ${status.state}`);
      }
    }
  });

  it("rejects a review without a reviewer or a valid day", () => {
    expect(statusProblems({ state: "draft" })).toEqual([]);
    expect(statusProblems({ state: "reviewed", reviewer: "Marie", date: "2026-11-12" })).toEqual([]);
    expect(statusProblems({ state: "reviewed", reviewer: " ", date: "12.11.2026" })).toEqual([
      "reviewer is empty",
      'date "12.11.2026" is not YYYY-MM-DD',
    ]);
    expect(statusProblems({ state: "reviewed", reviewer: "Marie", date: "2026-13-45" })).toEqual([
      'date "2026-13-45" is not YYYY-MM-DD',
    ]);
  });
});

describe("parityProblems", () => {
  const source = {
    hello: "Cześć, {name}",
    unread: { one: "{count} nowa", few: "{count} nowe", many: "{count} nowych", other: "{count} nowej" },
    group: { text: "tekst" },
  } satisfies Dict;

  it("reports missing, foreign, reshaped and re-parametrised texts", () => {
    expect(
      parityProblems("en", source, { hello: "Hi, {nick}", unread: "new", extra: "x" }, { complete: true }),
    ).toEqual([
      "hello: parameters {nick} instead of {name}",
      "unread: plural expected",
      "unread: parameters {} instead of {count}",
      "extra: not in the Polish source",
      "group.text: missing",
    ]);
    expect(parityProblems("en", { hello: "Hi" }, { hello: { one: "a", other: "b" } }, { complete: true })).toEqual([
      "hello: text expected",
    ]);
  });

  it("checks plural forms against the language's own categories", () => {
    expect(
      parityProblems("en", source, { unread: { few: "{count} new", other: "{count} new" } }, { complete: false }),
    ).toEqual(["unread: lacks plural forms one", "unread: en has no plural forms few"]);
    expect(
      parityProblems("pl", source, { unread: { one: "{count} nowa", other: "{count} nowej" } }, { complete: false }),
    ).toEqual(["unread: lacks plural forms few, many"]);
    expect(
      parityProblems("fr", source, { unread: { one: "{count}", many: "{count}", other: "{count}" } }, { complete: false }),
    ).toEqual([]);
  });

  it("measures coverage and flattens nested groups", () => {
    expect(coverage(source, { hello: "x" })).toBe(33);
    expect(coverage({}, {})).toBe(100);
    expect([...flatten(source).keys()]).toEqual(["hello", "unread", "group.text"]);
  });
});
