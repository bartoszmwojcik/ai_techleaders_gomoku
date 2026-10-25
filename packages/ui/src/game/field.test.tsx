import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { TextInput } from "./text-input";

describe("Field", () => {
  it("connects the label to the control and adds no description by default", () => {
    const html = renderToStaticMarkup(
      <Field label="Kod zaproszenia" id="code">
        {(control) => <TextInput {...control} />}
      </Field>,
    );

    expect(html).toContain('<label for="code"');
    expect(html).toContain('id="code"');
    expect(html).toContain("Kod zaproszenia");
    expect(html).not.toContain(" aria-describedby=");
    expect(html).not.toContain(" aria-invalid=");
    expect(html).not.toContain(" aria-required=");
  });

  it("generates an id when none is given", () => {
    const html = renderToStaticMarkup(<Field label="E-mail">{(control) => <TextInput {...control} />}</Field>);

    expect(html).toMatch(/<label for="([^"]+)"[^>]*>E-mail<\/label>/);
  });

  it("shows the hint and the requirement text and describes the control with the hint", () => {
    const html = renderToStaticMarkup(
      <Field label="Hasło" id="pw" hint="Co najmniej 16 znaków" requirement="(wymagane)" required>
        {(control) => <TextInput type="password" {...control} />}
      </Field>,
    );

    expect(html).toContain("Co najmniej 16 znaków");
    expect(html).toContain("(wymagane)");
    expect(html).toContain('aria-describedby="pw-hint"');
    expect(html).toContain('aria-required="true"');
  });

  it("shows the error with an icon and marks the control invalid", () => {
    const html = renderToStaticMarkup(
      <Field label="E-mail" id="mail" hint="Podaj adres" error="Sprawdź adres e-mail">
        {(control) => <TextInput {...control} />}
      </Field>,
    );

    expect(html).toContain("Sprawdź adres e-mail");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="mail-hint mail-error"');
    expect(html).toContain('id="mail-error"');
    expect(html).toContain('aria-hidden="true"');
  });
});
