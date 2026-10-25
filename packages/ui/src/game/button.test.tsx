import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders a primary button of type button by default", () => {
    const html = renderToStaticMarkup(<Button>Załóż konto</Button>);

    expect(html).toContain('type="button"');
    expect(html).toContain("bg-action-primary-bg");
    expect(html).toContain("min-h-target");
    expect(html).toContain("text-body");
    expect(html).toContain("active:bg-action-primary-bg-pressed");
    expect(html).toContain("Załóż konto");
    expect(html).not.toContain(" aria-busy=");
    expect(html).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("applies the secondary and danger variants", () => {
    expect(renderToStaticMarkup(<Button variant="secondary">A</Button>)).toContain("border-border-control");
    expect(renderToStaticMarkup(<Button variant="danger">A</Button>)).toContain("active:bg-action-danger-bg-pressed");
  });

  it("keeps an explicit type and merges a custom class", () => {
    const html = renderToStaticMarkup(
      <Button type="submit" className="w-full">
        Zaloguj się
      </Button>,
    );

    expect(html).toContain('type="submit"');
    expect(html).toContain("w-full");
  });

  it("blocks a second submit and announces busy state while loading", () => {
    const html = renderToStaticMarkup(<Button loading>Zapisz</Button>);

    expect(html).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-spin");
    expect(html).toContain('aria-hidden="true"');
  });

  it("is disabled without a spinner when disabled", () => {
    const html = renderToStaticMarkup(<Button disabled>Dołącz</Button>);

    expect(html).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).not.toContain("animate-spin");
  });

  it("renders the child element with the button styles when asChild is set", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/login">Zaloguj się</a>
      </Button>,
    );

    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/login"');
    expect(html).toContain("bg-action-primary-bg");
  });
});
