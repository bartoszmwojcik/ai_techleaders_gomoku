import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GameGate } from "./game-gate";

describe("GameGate", () => {
  it("says the same thing for a missing game and a game without access, with a way out", () => {
    const html = renderToStaticMarkup(<GameGate />);
    expect(html).toContain("Ta partia nie istnieje albo nie masz do niej dostępu");
    expect(html).toContain("Sprawdź adres albo poproś znajomego o nowe zaproszenie.");
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/"');
  });
});
