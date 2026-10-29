import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GameError from "./error";
import GameLoading from "./loading";
import GameNotFound from "./not-found";


describe("the error states of the game page", () => {
  it("shows the loading shape with a name for assistive technology (p07.1)", () => {
    const html = renderToStaticMarkup(<GameLoading />);
    expect(html).toContain("Ładowanie partii");
  });

  it("shows the one 404 text (p07.2)", () => {
    const html = renderToStaticMarkup(<GameNotFound />);
    expect(html).toContain("Ta partia nie istnieje albo nie masz do niej dostępu");
  });

  it("offers a retry when the server does not answer (p07.4)", () => {
    const html = renderToStaticMarkup(<GameError error={new Error("x")} reset={() => {}} />);
    expect(html).toContain("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    expect(html).toContain("Spróbuj ponownie</button>");
    expect(html).toContain("Wróć na stronę główną");
    expect(html).not.toContain("x</");
  });
});
