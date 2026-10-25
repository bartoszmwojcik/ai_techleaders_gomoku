import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("announces what happened with an icon and the danger colour", () => {
    const html = renderToStaticMarkup(<ErrorState title="Nie udało się wczytać listy partii" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Nie udało się wczytać listy partii");
    expect(html).toContain("text-status-danger");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("text-text-secondary");
    expect(html).not.toContain("mt-group");
  });

  it("adds what to do and a retry action", () => {
    const html = renderToStaticMarkup(
      <ErrorState title="Brak połączenia" action={<button type="button">Spróbuj ponownie</button>} className="py-4">
        Sprawdź połączenie z internetem.
      </ErrorState>,
    );

    expect(html).toContain("Sprawdź połączenie z internetem.");
    expect(html).toContain("Spróbuj ponownie");
    expect(html).toContain("py-4");
  });
});
