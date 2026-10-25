import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("shows the product name as a link home inside a banner", () => {
    const html = renderToStaticMarkup(<PageHeader brand="Gomoku" />);

    expect(html).toContain("<header");
    expect(html).toContain('<a href="/"');
    expect(html).toContain("Gomoku");
    expect(html).toContain("border-border-default");
    expect(html).not.toContain("<nav");
  });

  it("links to a custom home address and merges a class", () => {
    const html = renderToStaticMarkup(<PageHeader brand="Gomoku" homeHref="/pl" className="bg-surface-page" />);

    expect(html).toContain('href="/pl"');
    expect(html).toContain("bg-surface-page");
  });

  it("names the navigation and renders the actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        brand="Gomoku"
        navigation={<a href="/lobby">Lobby</a>}
        navigationLabel="Główna nawigacja"
      >
        <a href="/login">Zaloguj się</a>
      </PageHeader>,
    );

    expect(html).toContain('<nav aria-label="Główna nawigacja"');
    expect(html).toContain("Lobby");
    expect(html).toContain("Zaloguj się");
  });
});
