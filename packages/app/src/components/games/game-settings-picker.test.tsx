// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/games/settings";

import frHome from "@/i18n/catalogs/fr/home";

import { GameSettingsPicker } from "./game-settings-picker";

afterEach(cleanup);

describe("GameSettingsPicker", () => {
  it("offers the variant, the classic one picked, and no clock", () => {
    render(<GameSettingsPicker value={DEFAULT_SETTINGS} onChange={() => {}} />);
    expect((screen.getByRole("radio", { name: "Klasyczny" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("radiogroup", { name: "Czas na gracza" })).toBeNull();
  });

  it("shows the clock of the paper game, three minutes picked", () => {
    render(<GameSettingsPicker value={{ variant: "paper", timeControlMs: 180_000 }} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "3 min" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });

  it("reports the picked variant and clock, keeping the other setting", () => {
    const onChange = vi.fn();
    const { rerender } = render(<GameSettingsPicker value={DEFAULT_SETTINGS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Papier i ołówek" }));
    expect(onChange).toHaveBeenLastCalledWith({ variant: "paper", timeControlMs: 180_000 });

    rerender(<GameSettingsPicker value={{ variant: "paper", timeControlMs: 180_000 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "5 min" }));
    expect(onChange).toHaveBeenLastCalledWith({ variant: "paper", timeControlMs: 300_000 });
  });
});

describe("GameSettingsPicker in French (E15-S03)", () => {
  it("labels the variant and the clock", () => {
    render(<GameSettingsPicker value={{ variant: "paper", timeControlMs: 180_000 }} onChange={() => {}} locale="fr" dict={frHome} />);
    expect(screen.getByRole("radiogroup", { name: "Variante" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Papier et crayon" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radiogroup", { name: "Temps par joueur" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "3\u00a0min" }).getAttribute("aria-checked")).toBe("true");
  });
});
