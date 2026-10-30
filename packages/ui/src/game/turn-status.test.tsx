import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TurnStatus } from "./turn-status";

describe("TurnStatus", () => {
  it("outlines the stone marker with the control border so a black stone shows on the dark page", () => {
    const html = renderToStaticMarkup(<TurnStatus color="black">Twój ruch (czarne)</TurnStatus>);

    expect(html).toContain("border-border-control");
    expect(html).not.toContain("border-piece-outline");
  });

  it("announces whose turn it is politely, in words", () => {
    const html = renderToStaticMarkup(<TurnStatus>Ruch przeciwnika</TurnStatus>);

    expect(html).toContain('role="status"');
    expect(html).toContain("Ruch przeciwnika");
    expect(html).not.toContain("rounded-piece");
  });

  it("shows a reminder stone in the player's colour", () => {
    expect(renderToStaticMarkup(<TurnStatus color="black">Twój ruch (czarne)</TurnStatus>)).toContain("bg-piece-black");
    expect(renderToStaticMarkup(<TurnStatus color="white" className="mt-4">Twój ruch (białe)</TurnStatus>)).toContain("bg-piece-white");
  });
});
