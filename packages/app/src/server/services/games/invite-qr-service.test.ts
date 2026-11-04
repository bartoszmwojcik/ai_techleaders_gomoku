import { describe, expect, it, vi } from "vitest";

import { InviteQrService } from "./invite-qr-service";
import { qrSvg } from "./invite-qr";

vi.mock("./invite-qr", () => ({ qrSvg: vi.fn(async (text: string) => `<svg>${text}</svg>`) }));

const NOW = new Date("2026-11-04T12:00:00Z");

function service(row: Record<string, unknown> | undefined, serverConfig: { appOrigin?: string } = { appOrigin: "https://gomoku.example" }) {
  const execute = vi.fn(async () => (row ? [row] : []));
  return {
    execute,
    qr: new InviteQrService({
      em: { execute } as never,
      clock: { now: () => NOW },
      serverConfig,
    }),
  };
}

const LINK_SVG = "<svg>https://gomoku.example/invite/ABCD-EFGH</svg>";
const row = (over: Record<string, unknown>) => ({ status: "waiting", is_public: false, code: "ABCDEFGH", alive: true, ...over });

describe("InviteQrService", () => {
  it("gives the code of a waiting game with a live invitation, with the same link as the card", async () => {
    const { qr, execute } = service(row({}));

    await expect(qr.svgFor("g1")).resolves.toBe(LINK_SVG);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("i.expires_at > ?"), [NOW, "g1"]);
    expect(qrSvg).toHaveBeenCalledWith("https://gomoku.example/invite/ABCD-EFGH");
  });

  it("uses the development address when no origin is configured", async () => {
    const { qr } = service(row({}), {});

    await expect(qr.svgFor("g1")).resolves.toBe("<svg>http://localhost:3000/invite/ABCD-EFGH</svg>");
  });

  it("gives the code of a public game in progress, even when the invitation's time is over", async () => {
    const { qr } = service(row({ status: "active", is_public: true, alive: false }));

    await expect(qr.svgFor("g1")).resolves.toBe(LINK_SVG);
  });

  it.each([
    ["an expired invitation", row({ alive: false })],
    ["a private game in progress, also after closing the audience", row({ status: "active" })],
    ["a cancelled game", row({ status: "cancelled" })],
    ["a finished public game", row({ status: "finished", is_public: true })],
    ["a game without an invitation", undefined],
  ])("answers 404 for %s", async (_name, found) => {
    const { qr } = service(found);

    await expect(qr.svgFor("g1")).rejects.toMatchObject({ status: 404 });
  });
});
