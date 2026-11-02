import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InfoToggleButton, InfoToggleNote } from "./info-toggle";

describe("InfoToggleButton", () => {
  it("is a named button that says whether the note is open and which note it controls", () => {
    const html = renderToStaticMarkup(<InfoToggleButton label="Informacja" expanded={false} controls="n1" className="x" />);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Informacja"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="n1"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("min-h-target");
    expect(html).toContain("x");
  });

  it("reports an open note", () => {
    expect(renderToStaticMarkup(<InfoToggleButton label="I" expanded controls="n1" type="submit" />)).toContain('aria-expanded="true"');
  });
});

describe("InfoToggleNote", () => {
  it("is hidden while closed and visible while open", () => {
    expect(renderToStaticMarkup(<InfoToggleNote id="n1" open={false}>Tekst</InfoToggleNote>)).toContain("hidden");
    const open = renderToStaticMarkup(<InfoToggleNote id="n1" open className="y" data-testid="t">Tekst</InfoToggleNote>);
    expect(open).not.toContain("hidden");
    expect(open).toContain('id="n1"');
    expect(open).toContain("Tekst");
    expect(open).toContain('data-testid="t"');
    expect(open).toContain("y");
  });
});
