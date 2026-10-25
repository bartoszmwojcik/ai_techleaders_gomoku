import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("shows only the reason when nothing else is given", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nikt teraz nie szuka gry" />);

    expect(html).toContain("Nikt teraz nie szuka gry");
    expect(html).not.toContain("text-text-secondary");
    expect(html).not.toContain("mt-group");
  });

  it("adds the explanation and the next step", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Nie rozegrałeś jeszcze żadnej partii" action={<a href="/join">Dołącz kodem</a>} className="py-4">
        Zagraj ze znajomym, a partia pojawi się tutaj.
      </EmptyState>,
    );

    expect(html).toContain("Zagraj ze znajomym, a partia pojawi się tutaj.");
    expect(html).toContain('<a href="/join">Dołącz kodem</a>');
    expect(html).toContain("py-4");
  });
});
