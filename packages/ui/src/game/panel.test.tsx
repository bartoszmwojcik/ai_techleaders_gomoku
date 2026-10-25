import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Panel } from "./panel";

describe("Panel", () => {
  it("renders a bordered raised section without a label when there is no title", () => {
    const html = renderToStaticMarkup(<Panel>Treść</Panel>);

    expect(html).toContain("<section");
    expect(html).toContain("bg-surface-raised");
    expect(html).toContain("border-border-default");
    expect(html).toContain("Treść");
    expect(html).not.toContain("aria-labelledby");
    expect(html).not.toContain("<h2");
  });

  it("labels the region with its heading", () => {
    const html = renderToStaticMarkup(<Panel title="Lobby">Lista</Panel>);

    expect(html).toMatch(/<section aria-labelledby="([^"]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`<h2 id="${id}"`);
    expect(html).toContain("Lobby");
  });

  it("uses the requested heading level and merges a class and attributes", () => {
    const html = renderToStaticMarkup(
      <Panel title="Historia" headingLevel={3} className="mt-4" data-testid="history">
        x
      </Panel>,
    );

    expect(html).toContain("<h3");
    expect(html).toContain("mt-4");
    expect(html).toContain('data-testid="history"');
  });
});
