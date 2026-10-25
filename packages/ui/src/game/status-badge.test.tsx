import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("shows the word with an icon in the info colours by default", () => {
    const html = renderToStaticMarkup(<StatusBadge>Czeka na przeciwnika</StatusBadge>);

    expect(html).toContain("Czeka na przeciwnika");
    expect(html).toContain("border-status-info");
    expect(html).toContain("text-status-info");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("rounded-base");
  });

  it.each([
    ["success", "Wygrana"],
    ["warning", "Czas się kończy"],
    ["danger", "Porażka"],
  ] as const)("uses the %s colours", (status, word) => {
    const html = renderToStaticMarkup(<StatusBadge status={status}>{word}</StatusBadge>);

    expect(html).toContain(`border-status-${status}`);
    expect(html).toContain(word);
  });

  it("merges a custom class", () => {
    expect(renderToStaticMarkup(<StatusBadge className="ml-4">A</StatusBadge>)).toContain("ml-4");
  });
});
