import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders a checkbox inside a label that is a touch target", () => {
    const html = renderToStaticMarkup(<Checkbox label="Rozumiem skutki" id="confirm" />);

    expect(html).toContain('role="checkbox"');
    expect(html).toContain('id="confirm"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Rozumiem skutki");
    expect(html).toContain("min-h-target");
    expect(html).not.toContain(" aria-describedby=");
  });

  it("generates an id when none is given", () => {
    expect(renderToStaticMarkup(<Checkbox label="A" />)).toMatch(/role="checkbox"[^>]*id="[^"]+"|id="[^"]+"[^>]*role="checkbox"/);
  });

  it("describes the checkbox with the hint", () => {
    const html = renderToStaticMarkup(<Checkbox label="Usuń konto" id="del" hint="Tego nie da się cofnąć" />);

    expect(html).toContain("Tego nie da się cofnąć");
    expect(html).toContain('aria-describedby="del-hint"');
    expect(html).toContain('id="del-hint"');
  });

  it("shows a tick when checked and merges a custom class", () => {
    const html = renderToStaticMarkup(<Checkbox label="A" id="a" defaultChecked className="mt-4" />);

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-state="checked"');
    expect(html).toContain("mt-4");
  });

  it("can be disabled", () => {
    expect(renderToStaticMarkup(<Checkbox label="A" id="a" disabled />)).toContain("disabled");
  });
});
