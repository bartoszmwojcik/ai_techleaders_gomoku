import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TextInput } from "./text-input";

describe("TextInput", () => {
  it("renders a text input with the control border and a touch target", () => {
    const html = renderToStaticMarkup(<TextInput name="code" />);

    expect(html).toContain('type="text"');
    expect(html).toContain('name="code"');
    expect(html).toContain("border-border-control");
    expect(html).toContain("min-h-target");
  });

  it("keeps an explicit type and passes attributes through", () => {
    const html = renderToStaticMarkup(
      <TextInput type="email" autoComplete="email" aria-invalid className="max-w-sm" />,
    );

    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("max-w-sm");
  });
});
