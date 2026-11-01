import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlayerClock } from "./player-clock";

describe("PlayerClock", () => {
  it("shows the name and the time as m:ss with a machine-readable duration", () => {
    const html = renderToStaticMarkup(<PlayerClock name="Ala_7" remainingMs={581_000} />);

    expect(html).toContain("Ala_7");
    expect(html).toContain("9:41");
    expect(html).toContain('dateTime="PT9M41S"');
    expect(html).toContain('role="timer"');
    expect(html).toContain("tabular-nums");
    expect(html).toContain("border-border-default");
    expect(html).not.toContain("aria-current");
  });

  it("is compact on a narrow screen and roomy from `sm` (issue 181)", () => {
    const html = renderToStaticMarkup(<PlayerClock name="Ala_7" remainingMs={581_000} />);

    expect(html).toMatch(/class="[^"]*\bpx-3 py-2\b[^"]*\bsm:p-4\b/);
    expect(html).toMatch(/class="[^"]*\btext-subsection\b[^"]*\bsm:text-section\b/);
  });

  it("marks the running clock with a strong outline and a word", () => {
    const html = renderToStaticMarkup(
      <PlayerClock name="Ala_7" remainingMs={300_000} active activeLabel="Twój ruch" className="w-full" />,
    );

    expect(html).toContain("border-text-primary");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Twój ruch");
    expect(html).toContain("w-full");
  });

  it("does not show the active word on a stopped clock or when none is given", () => {
    expect(renderToStaticMarkup(<PlayerClock name="B" remainingMs={1} activeLabel="Twój ruch" />)).not.toContain("Twój ruch");
    expect(renderToStaticMarkup(<PlayerClock name="B" remainingMs={600_000} active />)).toContain('aria-current="true"');
  });

  it("warns below the threshold only when a low-time word is given", () => {
    const low = renderToStaticMarkup(<PlayerClock name="B" remainingMs={59_000} lowLabel="Mało czasu" />);
    const enough = renderToStaticMarkup(<PlayerClock name="B" remainingMs={61_000} lowLabel="Mało czasu" />);
    const noWord = renderToStaticMarkup(<PlayerClock name="B" remainingMs={5_000} />);
    const custom = renderToStaticMarkup(<PlayerClock name="B" remainingMs={90_000} lowLabel="Mało czasu" lowThresholdMs={120_000} />);

    expect(low).toContain("Mało czasu");
    expect(enough).not.toContain("Mało czasu");
    expect(noWord).not.toContain("border-status-warning");
    expect(custom).toContain("Mało czasu");
  });
});
