import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { withNodes } from "./rich";

describe("withNodes", () => {
  it("puts components where the sentence has their markers, in the language's own order", () => {
    expect(renderToStaticMarkup(<p>{withNodes("{link}, żeby dołączyć.", { link: <a href="/login">Zaloguj się</a> })}</p>)).toBe(
      '<p><a href="/login">Zaloguj się</a>, żeby dołączyć.</p>',
    );
    expect(renderToStaticMarkup(<p>{withNodes("Session expirée. {link} pour envoyer.", { link: <b>Connectez-vous</b> })}</p>)).toBe(
      "<p>Session expirée. <b>Connectez-vous</b> pour envoyer.</p>",
    );
  });

  it("keeps a sentence without markers and an unknown marker as text", () => {
    expect(renderToStaticMarkup(<p>{withNodes("Bez linku.", {})}</p>)).toBe("<p>Bez linku.</p>");
    expect(renderToStaticMarkup(<p>{withNodes("A {other} B", { link: <i>x</i> })}</p>)).toBe("<p>A {other} B</p>");
  });
});
