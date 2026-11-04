import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { inviteQrPath, PublicGameQr } from "./public-game-qr";

describe("PublicGameQr", () => {
  it("shows the code of the game's link while the game has an audience", () => {
    const html = renderToStaticMarkup(<PublicGameQr gameId="g1" audience={{ spectators: 0 }} />);

    expect(html).toContain(`src="${inviteQrPath("g1")}"`);
    expect(html).toContain('alt="Kod QR z linkiem do oglądania partii"');
  });

  it("shows nothing without an audience (a private game, or the audience closed)", () => {
    expect(renderToStaticMarkup(<PublicGameQr gameId="g1" />)).toBe("");
  });
});
