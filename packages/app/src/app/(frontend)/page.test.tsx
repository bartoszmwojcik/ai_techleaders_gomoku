import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

const count = (html: string, fragment: string) => html.split(fragment).length - 1;

describe("HomePage", () => {
  const html = renderToStaticMarkup(<HomePage />);

  it("introduces the game and its rules", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("Gomoku</h1>");
    expect(html).toContain("Pięć w linii wygrywa.");
    expect(html).toContain("plansza 15×15");
  });

  it("renders a decorative 15×15 board preview with three stones of each colour", () => {
    expect(html).toContain('aria-hidden="true" data-testid="board"');
    expect(html).toContain("grid-template-columns:repeat(15, minmax(0, 1fr))");
    expect(count(html, "relative flex items-center justify-center")).toBe(225);
    expect(count(html, "bg-piece-black")).toBe(3);
    expect(count(html, "bg-piece-white")).toBe(3);
  });
});
