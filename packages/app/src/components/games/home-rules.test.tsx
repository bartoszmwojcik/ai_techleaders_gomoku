// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeRulesLine, HomeRulesProvider, useHomeRules } from "./home-rules";

afterEach(cleanup);

function Pick() {
  const { setVariant } = useHomeRules();
  return (
    <>
      <button onClick={() => setVariant("paper")}>paper</button>
      <button onClick={() => setVariant("classic")}>classic</button>
    </>
  );
}

describe("HomeRulesLine", () => {
  it("shows the classic line, politely announced, without a provider", () => {
    render(<HomeRulesLine />);
    const line = screen.getByTestId("home-rules");
    expect(line.textContent).toBe("Swobodne zasady · plansza 15×15 · 10 minut na gracza");
    expect(line.getAttribute("aria-live")).toBe("polite");
  });

  it("ignores a choice made outside a provider", () => {
    render(<><Pick /><HomeRulesLine /></>);
    act(() => screen.getByText("paper").click());
    expect(screen.getByTestId("home-rules").textContent).toContain("Swobodne zasady");
  });

  it("follows the variant picked inside a provider", () => {
    render(<HomeRulesProvider><Pick /><HomeRulesLine /></HomeRulesProvider>);
    act(() => screen.getByText("paper").click());
    expect(screen.getByTestId("home-rules").textContent).toBe("Kółko i krzyżyk na kartce papieru, 5 w linii, gra na czas.");
    act(() => screen.getByText("classic").click());
    expect(screen.getByTestId("home-rules").textContent).toContain("Swobodne zasady");
  });
});
