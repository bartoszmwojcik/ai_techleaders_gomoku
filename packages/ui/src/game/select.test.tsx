import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { Select } from "./select";

const options = [
  { value: "a", label: "Alfa" },
  { value: "b", label: "Beta" },
];

describe("Select", () => {
  it("renders a native select with the options and a touch target", () => {
    const html = renderToStaticMarkup(<Select name="client" options={options} defaultValue="b" />);

    expect(html).toContain("<select");
    expect(html).toContain('name="client"');
    expect(html).toContain('<option value="a"');
    expect(html).toContain(">Alfa</option>");
    expect(html).toContain(">Beta</option>");
    expect(html).toContain("min-h-target");
    expect(html).toContain("border-border-control");
    expect(html).toContain('aria-hidden="true"');
  });

  it("passes attributes through and merges the class", () => {
    const html = renderToStaticMarkup(<Select options={options} aria-invalid className="max-w-sm" disabled />);

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("max-w-sm");
    expect(html).toContain("disabled");
  });

  it("is labelled by a Field", () => {
    const html = renderToStaticMarkup(
      <Field label="Klient" hint="Wybierz klienta" id="c">
        {(control) => <Select options={options} {...control} />}
      </Field>,
    );

    expect(html).toContain('for="c"');
    expect(html).toContain('id="c"');
    expect(html).toContain('aria-describedby="c-hint"');
  });
});
