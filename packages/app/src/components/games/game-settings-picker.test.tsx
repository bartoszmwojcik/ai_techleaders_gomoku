// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/games/settings";

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
