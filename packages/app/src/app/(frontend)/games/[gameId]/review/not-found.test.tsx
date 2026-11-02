import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReviewNotFound from "./not-found";

describe("ReviewNotFound", () => {
  it("gives one readable text for a missing, a removed and a foreign game", () => {
    const html = renderToStaticMarkup(<ReviewNotFound />);

    expect(html).toContain("Nie możemy otworzyć tej partii");
    expect(html).toContain("Partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu.");
    expect(html).toContain('href="/history"');
  });
});
