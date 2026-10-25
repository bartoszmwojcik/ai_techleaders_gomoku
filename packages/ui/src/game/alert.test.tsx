import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Alert } from "./alert";

describe("Alert", () => {
  it("defaults to a polite info message with a title and details", () => {
    const html = renderToStaticMarkup(<Alert title="Potwierdź e-mail, aby grać">Sprawdź też folder spam.</Alert>);

    expect(html).toContain('role="status"');
    expect(html).toContain("border-status-info");
    expect(html).toContain("Potwierdź e-mail, aby grać");
    expect(html).toContain("Sprawdź też folder spam.");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders only the title when there are no details", () => {
    const html = renderToStaticMarkup(<Alert title="Adres potwierdzony" status="success" />);

    expect(html).toContain('role="status"');
    expect(html).toContain("border-status-success");
    expect(html).not.toContain("text-text-secondary");
  });

  it("interrupts for warnings and errors", () => {
    const warning = renderToStaticMarkup(<Alert title="Grasz bez konta" status="warning" />);
    const danger = renderToStaticMarkup(<Alert title="Nie udało się wysłać" status="danger" />);

    expect(warning).toContain('role="alert"');
    expect(warning).toContain("border-status-warning");
    expect(danger).toContain('role="alert"');
    expect(danger).toContain("border-status-danger");
  });

  it("lets the caller choose a politer role than the status implies", () => {
    expect(renderToStaticMarkup(<Alert title="Przegrałeś" status="danger" role="status" />)).toContain('role="status"');
  });

  it("merges a custom class", () => {
    expect(renderToStaticMarkup(<Alert title="A" className="mt-4" />)).toContain("mt-4");
  });
});
