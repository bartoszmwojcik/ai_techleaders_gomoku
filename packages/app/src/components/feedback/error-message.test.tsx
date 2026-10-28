import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorMessage } from "./error-message";

describe("ErrorMessage", () => {
  it("renders an alert with title and details", () => {
    const html = renderToStaticMarkup(<ErrorMessage title="Nie udało się" className="x">Spróbuj ponownie.</ErrorMessage>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Nie udało się");
    expect(html).toContain("Spróbuj ponownie.");
  });

  it("renders nothing without a title", () => {
    expect(renderToStaticMarkup(<ErrorMessage />)).toBe("");
  });
});
