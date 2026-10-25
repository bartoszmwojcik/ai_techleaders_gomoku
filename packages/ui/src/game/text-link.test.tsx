import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TextLink } from "./text-link";

describe("TextLink", () => {
  it("renders an underlined inline link in the accent colour", () => {
    const html = renderToStaticMarkup(<TextLink href="/help">Jak to działa</TextLink>);

    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/help"');
    expect(html).toContain("underline");
    expect(html).toContain("text-text-accent");
    expect(html).not.toContain("min-h-target");
  });

  it("gives a standalone link a touch target", () => {
    const html = renderToStaticMarkup(
      <TextLink href="/account" placement="standalone">
        Konto
      </TextLink>,
    );

    expect(html).toContain("min-h-target");
  });

  it("renders the child element when asChild is set", () => {
    const html = renderToStaticMarkup(
      <TextLink asChild className="font-strong">
        <span role="link">Konto</span>
      </TextLink>,
    );

    expect(html).toMatch(/^<span /);
    expect(html).toContain("font-strong");
  });
});
