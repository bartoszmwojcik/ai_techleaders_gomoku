import { describe, expect, it, vi } from "vitest";

import enShow from "@/i18n/catalogs/en/show";
import frShow from "@/i18n/catalogs/fr/show";

import { PROJECTOR_STORAGE_KEY, cellLabelOf, errorText, projectorParam, readStoredProjector, seatName, showTranslator, storeProjector } from "./texts";

const pl = showTranslator();
const fr = showTranslator("fr", frShow);

const bot = (level: 1 | 2, tableMb: number | null) =>
  ({ seat: 1, kind: "bot", displayName: "Bot · poziom 2", bot: { level, memoryMb: null, tableMb } }) as const;

describe("seatName", () => {
  it("names a bot from its strength in the reader's language (i18n I14)", () => {
    expect(seatName(pl, bot(1, null))).toBe("Bot · poziom 1");
    expect(seatName(pl, bot(2, 16))).toBe("Bot · poziom 2 · 16 MB");
    expect(seatName(showTranslator("en", enShow), bot(2, 16))).toBe("Bot · level 2 · 16 MB");
    expect(seatName(fr, bot(2, 16))).toBe("Bot · niveau 2 · 16\u202fMo");
  });

  it("names an agent and its declared name, and falls back to the server's name", () => {
    expect(seatName(pl, { seat: 2, kind: "agent", displayName: null, agentName: "claude" })).toBe("Agent · claude (deklarowane)");
    expect(seatName(pl, { seat: 2, kind: "agent", displayName: null, agentName: null })).toBe("Agent");
    expect(seatName(pl, { seat: 2, kind: "bot", displayName: "Bot · poziom 1" })).toBe("Bot · poziom 1");
    expect(seatName(pl, { seat: 2, kind: "account", displayName: null })).toBe("");
  });
});

describe("cellLabelOf", () => {
  it("labels a cell for screen readers", () => {
    expect(cellLabelOf(pl)({ column: "C", row: 7, state: "empty" })).toBe("Kolumna C, rząd 7, puste");
    expect(cellLabelOf(fr)({ column: "C", row: 7, state: "black" })).toBe("Colonne C, rangée 7, pierre noire");
  });
});

describe("errorText", () => {
  it("tells the administrator why, by code and reason", () => {
    expect(errorText(pl, { code: "SHOW_RUNNING" })).toBe(pl("errors.SHOW_RUNNING"));
    expect(errorText(pl, { code: "RATE_LIMITED" })).toBe(pl("errors.RATE_LIMITED"));
    expect(errorText(pl, { code: "SHOW_UNAVAILABLE", data: { reason: "bot_vs_bot_disabled" } })).toBe(pl("errors.SHOW_UNAVAILABLE.bot_vs_bot_disabled"));
    expect(errorText(pl, { code: "SHOW_UNAVAILABLE" })).toBe(pl("errors.SHOW_UNAVAILABLE.disabled"));
    expect(errorText(pl, { code: "BOT_UNAVAILABLE", data: { reason: "busy" } })).toBe(pl("errors.BOT_UNAVAILABLE.busy"));
    expect(errorText(pl, { code: "BOT_UNAVAILABLE", data: { reason: 7 } })).toBe(pl("errors.BOT_UNAVAILABLE.other"));
    expect(errorText(pl, { code: "BOT_UNAVAILABLE", data: { reason: "new" } })).toBe(pl("errors.BOT_UNAVAILABLE.other"));
    expect(errorText(pl, { code: "network" })).toBe(pl("errors.other"));
  });
});

describe("the projector view's state", () => {
  it("reads the address: 1 on, 0 off, anything else undecided", () => {
    expect(projectorParam("1")).toBe(true);
    expect(projectorParam(["0", "1"])).toBe(false);
    expect(projectorParam("yes")).toBeNull();
    expect(projectorParam(undefined)).toBeNull();
  });

  it("keeps the browser's choice in storage, and survives blocked storage", () => {
    const store = new Map<string, string>();
    const storage = () => ({ getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) }) as unknown as Storage;
    expect(readStoredProjector(storage)).toBe(false);
    storeProjector(true, storage);
    expect(store.get(PROJECTOR_STORAGE_KEY)).toBe("1");
    expect(readStoredProjector(storage)).toBe(true);
    storeProjector(false, storage);
    expect(readStoredProjector(storage)).toBe(false);

    const blocked = vi.fn(() => {
      throw new Error("SecurityError");
    });
    expect(readStoredProjector(blocked)).toBe(false);
    expect(() => storeProjector(true, blocked)).not.toThrow();
  });

  it("uses the window's storage by default", () => {
    const getItem = vi.fn(() => "1");
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    expect(readStoredProjector()).toBe(true);
    storeProjector(false);
    expect(setItem).toHaveBeenCalledWith(PROJECTOR_STORAGE_KEY, "0");
    vi.unstubAllGlobals();
  });
});
