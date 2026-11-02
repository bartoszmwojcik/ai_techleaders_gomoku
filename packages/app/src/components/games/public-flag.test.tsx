import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicFlag } from "./public-flag";

describe("PublicFlag", () => {
  it("shows the flag with the number of spectators", () => {
    const html = renderToStaticMarkup(<PublicFlag audience={{ spectators: 3 }} />);
    expect(html).toContain('data-testid="public-flag"');
    expect(html).toContain("Partia publiczna");
    expect(html).toMatch(/data-testid="public-flag-count">3</);
  });

  it("shows zero as a number, not as a missing flag", () => {
    expect(renderToStaticMarkup(<PublicFlag audience={{ spectators: 0 }} />)).toMatch(/public-flag-count">0</);
  });

  it("shows nothing without an audience", () => {
    expect(renderToStaticMarkup(<PublicFlag />)).toBe("");
  });
});
