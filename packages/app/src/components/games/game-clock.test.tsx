import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GameClock } from "./game-clock";

const html = (remainingMs: number, active = false) =>
  renderToStaticMarkup(<GameClock name="Ala_7" remainingMs={remainingMs} active={active} activeLabel="Twój ruch" />);

describe("GameClock", () => {
  it("shows m:ss digits in the slot of the clock", () => {
    const markup = html(541_000);
    expect(markup).toContain('data-slot="clock"');
    expect(markup).toContain("9:01");
    expect(markup).not.toContain("data-low");
  });

  it("marks the low-time variant below a minute without any visible text (#23 Q1)", () => {
    const markup = html(59_999);
    expect(markup).toContain('data-low="true"');
    expect(markup).toContain("1:00");
    expect(markup).not.toMatch(/[Mm]ało czasu/);
  });

  it("is not low at exactly one minute", () => {
    expect(html(60_000)).not.toContain("data-low");
  });

  it("keeps the word of the running clock", () => {
    expect(html(300_000, true)).toContain("Twój ruch");
    expect(html(300_000)).not.toContain("Twój ruch");
  });
});
