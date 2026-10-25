import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GameResultBanner } from "./game-result-banner";

describe("GameResultBanner", () => {
  it.each([
    ["win", "Wygrałeś", "border-status-success"],
    ["loss", "Przegrałeś", "border-status-danger"],
    ["draw", "Remis", "border-status-info"],
  ] as const)("shows %s with the matching status and a polite role", (result, title, border) => {
    const html = renderToStaticMarkup(<GameResultBanner result={result} title={title}>Pięć w linii</GameResultBanner>);

    expect(html).toContain('role="status"');
    expect(html).toContain(title);
    expect(html).toContain(border);
    expect(html).toContain("Pięć w linii");
  });

  it("merges a custom class", () => {
    expect(renderToStaticMarkup(<GameResultBanner result="draw" title="Remis" className="mt-4" />)).toContain("mt-4");
  });
});
