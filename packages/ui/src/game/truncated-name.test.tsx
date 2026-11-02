import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TruncatedName } from "./truncated-name";

describe("TruncatedName", () => {
  it("cuts the name and keeps the fixed lead and tail apart from it", () => {
    const html = renderToStaticMarkup(
      <TruncatedName lead="Ty: " tail=" (gość)" title="Ty: Piotr (gość)" data-testid="n" className="extra">
        Piotr
      </TruncatedName>,
    );
    expect(html).toContain('title="Ty: Piotr (gość)"');
    expect(html).toContain('data-testid="n"');
    expect(html).toContain("extra");
    expect(html).toContain('<span class="shrink-0 whitespace-pre">Ty: </span>');
    expect(html).toContain('<span class="min-w-0 truncate">Piotr</span>');
    expect(html).toContain('<span class="shrink-0 whitespace-pre"> (gość)</span>');
  });

  it("renders only the name when there is no lead or tail", () => {
    const html = renderToStaticMarkup(<TruncatedName>Ala_7</TruncatedName>);
    expect(html).toContain('<span class="min-w-0 truncate">Ala_7</span>');
    expect(html).not.toContain("shrink-0");
    expect(html).not.toContain("title=");
  });
});
