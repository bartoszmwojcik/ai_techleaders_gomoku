import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FinishedGameStats } from "@gomoku/core";

import { GameCountersSection } from "./game-counters";

const stats: FinishedGameStats = {
  timeZone: "Europe/Warsaw",
  total: 8,
  today: 3,
  last7Days: 6,
  pairs: [
    { pair: "account-account", kinds: ["account", "account"], total: 4, today: 1, last7Days: 3 },
    { pair: "account-guest", kinds: ["account", "guest"], total: 0, today: 0, last7Days: 0 },
  ],
};

describe("GameCountersSection", () => {
  const html = renderToStaticMarkup(
    <GameCountersSection
      accounts={{ total: 12, verified: 10, unverified: 2 }}
      games={{
        byStatus: { waiting: 1, active: 2, finished: 9, cancelled: 3 },
        finishedByOrigin: { invite: 5, lobby: 3, rematch: 1 },
        finishedByEndReason: { five_in_row: 4, draw: 1, timeout: 2, resignation: 2 },
      }}
      stats={stats}
    />,
  );

  const stat = (label: string, value: number) =>
    expect(html).toMatch(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${value}</dd>`));

  it("shows the account totals", () => {
    stat("Wszystkie", 12);
    stat("E-mail potwierdzony", 10);
    stat("E-mail niepotwierdzony", 2);
  });

  it("shows the games in the database by status, origin and end reason", () => {
    stat("oczekujące", 1);
    stat("trwające", 2);
    stat("zakończone", 9);
    stat("anulowane", 3);
    stat("z zaproszenia", 5);
    stat("rewanż", 1);
    stat("pięć w linii", 4);
    stat("poddanie", 2);
    expect(html).toContain("Partie w bazie teraz");
  });

  it("shows the persistent counter, zeros included, by pair of kinds", () => {
    stat("Dziś", 3);
    stat("Ostatnie 7 dni", 6);
    stat("Razem", 8);
    stat("konto – konto", 4);
    stat("konto – gość", 0);
    expect(html).toContain("Europe/Warsaw");
  });
});
