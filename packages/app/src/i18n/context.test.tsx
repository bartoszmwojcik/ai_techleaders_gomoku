import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import frCommon from "./catalogs/fr/common";
import frHome from "./catalogs/fr/home";
import plCommon from "./catalogs/pl/common";
import plHome from "./catalogs/pl/home";
import { I18nProvider, useT } from "./context";

function Names() {
  const common = useT("common", plCommon);
  const home = useT("home", plHome);
  return <p>{`${common("player.guestDefault", { seat: 2 })}|${home("shared.retry")}|${home.locale}`}</p>;
}

const html = (tree: React.ReactNode) => renderToStaticMarkup(<>{tree}</>);

describe("I18nProvider and useT (spec Q10)", () => {
  it("speaks Polish from the caller's fallback without a provider", () => {
    expect(html(<Names />)).toBe("<p>Gracz 2|Spróbuj ponownie|pl</p>");
  });

  it("speaks the provided namespace and falls back to Polish for one not provided", () => {
    expect(html(<I18nProvider locale="fr" dicts={{ common: frCommon }}><Names /></I18nProvider>)).toBe(
      "<p>Joueur 2|Spróbuj ponownie|pl</p>",
    );
  });

  it("joins a nested provider with its parent, the inner one winning on the same namespace", () => {
    const inner = { ...frHome, shared: { ...frHome.shared, retry: "Encore" } };
    expect(
      html(
        <I18nProvider locale="fr" dicts={{ common: frCommon, home: frHome }}>
          <I18nProvider locale="fr" dicts={{ home: inner }}>
            <Names />
          </I18nProvider>
        </I18nProvider>,
      ),
    ).toBe("<p>Joueur 2|Encore|fr</p>");
  });

  it("keeps the parent's language and texts under a provider that passes nothing (Polish page)", () => {
    expect(html(<I18nProvider locale="fr" dicts={{ common: frCommon }}><I18nProvider><Names /></I18nProvider></I18nProvider>)).toBe(
      "<p>Joueur 2|Spróbuj ponownie|pl</p>",
    );
    expect(html(<I18nProvider><Names /></I18nProvider>)).toBe("<p>Gracz 2|Spróbuj ponownie|pl</p>");
  });
});
