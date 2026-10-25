import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HistoryList, HistoryRow } from "./history-list";

describe("HistoryList and HistoryRow", () => {
  it("lists finished games with the result as a word with an icon", () => {
    const html = renderToStaticMarkup(
      <HistoryList label="Zakończone partie" className="max-w-xl">
        <HistoryRow opponent="Alicja_99" result="win" resultLabel="Wygrana" date="24.10.2026" reason="5 w linii" />
        <HistoryRow opponent="Zaproszony przez link" result="loss" resultLabel="Porażka" date="23.10.2026" className="py-4" />
        <HistoryRow opponent="Usunięty gracz" result="draw" resultLabel="Remis" date="20.10.2026" reason="Plansza pełna" />
      </HistoryList>,
    );

    expect(html).toContain('aria-label="Zakończone partie"');
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain("Wygrana");
    expect(html).toContain("border-status-success");
    expect(html).toContain("border-status-danger");
    expect(html).toContain("border-status-info");
    expect(html).toContain("Zaproszony przez link");
    expect(html).toContain("Usunięty gracz");
    expect(html).toContain("24.10.2026");
    expect(html).toContain("5 w linii");
    expect(html).toContain("Plansza pełna");
  });

  it("leaves out the reason when there is none", () => {
    const html = renderToStaticMarkup(
      <HistoryList label="Partie">
        <HistoryRow opponent="Ala" result="win" resultLabel="Wygrana" date="1.10.2026" />
      </HistoryList>,
    );

    expect(html).not.toContain("·");
  });
});
