import { describe, expect, it } from "vitest";

import frCommon from "@/i18n/catalogs/fr/common";
import { textsOf } from "@/i18n/client";

import { agentNameOf, botNameOf, playerName, playerNameOf } from "./player-name";

const fr = textsOf<"common">(frCommon, { locale: "fr", dict: frCommon });

describe("playerNameOf (E15-S04, I14, Q11)", () => {
  it("names the bot from its strength, with and without the table", () => {
    expect(playerNameOf({ kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, tableMb: 16 } }, fr).label).toBe(
      "Bot · niveau 2 · 16\u202fMo",
    );
    expect(playerNameOf({ kind: "bot", displayName: "Bot · poziom 1", bot: { level: 1, tableMb: null } }, fr).nick).toBe("Bot · niveau 1");
    expect(botNameOf({ level: 2, tableMb: 16 })).toBe("Bot · poziom 2 · 16 MB");
  });

  it("keeps the server's name for a bot view without the table size, and a plain word without any", () => {
    expect(playerNameOf({ kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2 } }, fr).nick).toBe("Bot · poziom 2 · 16 MB");
    expect(playerNameOf({ kind: "bot" }, fr).nick).toBe("Bot");
  });

  it("translates a guest's default nickname, and only a guest's", () => {
    expect(playerName({ seat: 1, kind: "guest", displayName: "Gracz 1", seen: true }, fr)).toBe("Joueur 1 (invité)");
    expect(playerName({ seat: 2, kind: "guest", displayName: "Gracz 2", seen: true }, fr)).toBe("Joueur 2 (invité)");
    expect(playerName({ seat: 2, kind: "guest", displayName: "Ala", seen: true }, fr)).toBe("Ala (invité)");
    expect(playerNameOf({ kind: "account", displayName: "Gracz 1" }, fr).label).toBe("Gracz 1");
    expect(playerNameOf({ kind: "bot", displayName: "Gracz 1" }, fr).label).toBe("Gracz 1");
    expect(playerNameOf({ kind: "agent", displayName: "Gracz 1", agentName: null }, fr).label).toBe("Agent");
  });

  it("names a deleted account and an agent with and without a declared name", () => {
    expect(playerNameOf({ kind: "account", displayName: null }, fr).label).toBe("Joueur supprimé");
    expect(playerNameOf(undefined).label).toBe("Usunięty gracz");
    expect(agentNameOf("Claude", fr)).toEqual({ nick: "Agent", guest: false, label: "Agent · Claude (déclaré)", agent: { declared: "Claude" } });
    expect(agentNameOf(undefined).label).toBe("Agent");
  });
});
