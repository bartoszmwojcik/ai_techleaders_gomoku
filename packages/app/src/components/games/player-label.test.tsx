import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlayerLabel } from "./player-label";

const guest = { nick: "Piotr", guest: true, label: "Piotr (gość)" };
const account = { nick: "Ala_7", guest: false, label: "Ala_7" };

describe("PlayerLabel", () => {
  it("shows an account name as plain text", () => {
    expect(renderToStaticMarkup(<>{PlayerLabel({ name: account })}</>)).toBe("Ala_7");
    expect(renderToStaticMarkup(<>{PlayerLabel({ name: account, you: true })}</>)).toBe("Ty (Ala_7)");
  });

  it("marks a guest, keeps the suffix apart from the truncated nickname and gives the full label", () => {
    const html = renderToStaticMarkup(<PlayerLabel name={guest} />);
    expect(html).toContain('title="Piotr (gość)"');
    expect(html).toContain('<span class="min-w-0 truncate">Piotr</span>');
    expect(html).toContain('<span class="shrink-0 whitespace-pre"> (gość)</span>');
    expect(html).not.toContain("Ty: ");
  });

  it("prefixes the viewer's own guest label", () => {
    expect(renderToStaticMarkup(<PlayerLabel name={guest} you />)).toContain("Ty: </span>");
  });
});
