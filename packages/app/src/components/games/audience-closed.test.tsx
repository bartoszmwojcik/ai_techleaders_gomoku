import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AudienceClosedScreen } from "./audience-closed";

describe("AudienceClosedScreen", () => {
  it("says the creator closed the audience and offers the way home", () => {
    const html = renderToStaticMarkup(<AudienceClosedScreen />);
    expect(html).toContain("Twórca zamknął publiczność");
    expect(html).toContain('data-testid="audience-closed"');
    expect(html).toContain('href="/"');
  });
});
