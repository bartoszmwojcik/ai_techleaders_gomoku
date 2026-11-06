// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_OPPONENT } from "@/lib/games/opponent";

import { OpponentPicker } from "./opponent-picker";

afterEach(cleanup);

const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");

describe("OpponentPicker (hosted-bot UI/UX)", () => {
  it("offers a person, picked, and the bot, without the level", () => {
    render(<OpponentPicker value={DEFAULT_OPPONENT} variant="classic" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Przeciwnik" })).toBeTruthy();
    expect(checked("Osoba (zaproszenie)")).toBe("true");
    expect(screen.queryByRole("radiogroup", { name: "Poziom bota" })).toBeNull();
    expect(screen.queryByTestId("bot-classic-only")).toBeNull();
  });

  it("shows the level of the bot and reports both choices", () => {
    const onChange = vi.fn();
    const { rerender } = render(<OpponentPicker value={DEFAULT_OPPONENT} variant="classic" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Bot" }));
    expect(onChange).toHaveBeenLastCalledWith({ opponent: "bot", botLevel: 1 });

    rerender(<OpponentPicker value={{ opponent: "bot", botLevel: 1 }} variant="classic" onChange={onChange} />);
    expect(checked("Bot")).toBe("true");
    expect(checked("Poziom 1")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Poziom 2" }));
    expect(onChange).toHaveBeenLastCalledWith({ opponent: "bot", botLevel: 2 });
  });

  it("turns the bot off in the paper game and says why (BR-56)", () => {
    render(<OpponentPicker value={{ opponent: "bot", botLevel: 2 }} variant="paper" onChange={() => {}} />);
    expect(checked("Osoba (zaproszenie)")).toBe("true");
    expect((screen.getByRole("radio", { name: "Bot" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("bot-classic-only").textContent).toBe("Bot gra tylko w klasyka.");
    expect(screen.queryByRole("radiogroup", { name: "Poziom bota" })).toBeNull();
  });

  it("is off while the form is busy", () => {
    render(<OpponentPicker value={{ opponent: "bot", botLevel: 1 }} variant="classic" onChange={() => {}} disabled />);
    expect((screen.getByRole("radio", { name: "Bot" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "Poziom 2" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
