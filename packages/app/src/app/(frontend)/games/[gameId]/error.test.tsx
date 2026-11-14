// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/context";
import frCommon from "@/i18n/catalogs/fr/common";

import GameError from "./error";

afterEach(cleanup);

describe("GameError", () => {
  it("re-fetches the segment with retry() (Next 16), not with reset()", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(<GameError error={new Error("x")} retry={retry} {...({ reset } as object)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
});

describe("GameError in French (E15-S04)", () => {
  it("reads the segment layout's namespace: it is rendered above the page (spec Q10)", () => {
    render(
      <I18nProvider locale="fr" dicts={{ common: frCommon }}>
        <GameError error={new Error("x")} retry={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText("Impossible de joindre le serveur. Réessayez.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Retour à l’accueil" })).toBeTruthy();
  });
});
