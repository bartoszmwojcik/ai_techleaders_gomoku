import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QrCode } from "./qr-code";

describe("QrCode", () => {
  it("is an image with a description for a screen reader and a caption", () => {
    const html = renderToStaticMarkup(<QrCode src="/qr.svg" label="Kod QR z linkiem" caption="Zeskanuj telefonem." className="extra" />);

    expect(html).toContain('src="/qr.svg"');
    expect(html).toContain('alt="Kod QR z linkiem"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("Zeskanuj telefonem.");
    expect(html).toContain("extra");
  });

  it("has no caption when none is given", () => {
    expect(renderToStaticMarkup(<QrCode src="/qr.svg" label="Kod QR" />)).not.toContain("figcaption");
  });
});
