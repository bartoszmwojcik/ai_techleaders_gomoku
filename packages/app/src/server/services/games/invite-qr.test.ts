import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import { qrSvg } from "./invite-qr";

const LINK = "https://gomoku.example/invite/ABCD-EFGH";
const SCALE = 4;

/** Draws the modules of the dark path of an SVG from `qrcode` into RGBA pixels, like a reader's camera. */
function pixelsOf(svg: string) {
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1]);
  const path = /<path stroke="#000000" d="([^"]+)"/.exec(svg)![1]!;
  const dark = new Set<string>();
  let x = 0;
  let y = 0;
  for (const [, op, value] of path.matchAll(/([Mmh])([\d.-]+(?: [\d.-]+)?)/g)) {
    const [a, b] = value!.split(" ").map(Number) as [number, number];
    if (op === "M") [x, y] = [a, b];
    if (op === "m") [x, y] = [x + a, y + b];
    if (op === "h") {
      for (let i = 0; i < a; i += 1) dark.add(`${x + i},${Math.floor(y)}`);
      x += a;
    }
  }
  const side = size * SCALE;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let py = 0; py < side; py += 1) {
    for (let px = 0; px < side; px += 1) {
      const value = dark.has(`${Math.floor(px / SCALE)},${Math.floor(py / SCALE)}`) ? 0 : 255;
      data.fill(value, (py * side + px) * 4, (py * side + px) * 4 + 3);
      data[(py * side + px) * 4 + 3] = 255;
    }
  }
  return { data, side, dark, size };
}

describe("qrSvg", () => {
  it("makes a code a reader reads back as exactly the same link", async () => {
    const { data, side } = pixelsOf(await qrSvg(LINK));

    expect(jsQR(data, side, side)?.data).toBe(LINK);
  });

  it("has dark modules on a light background with a quiet zone of 4 modules", async () => {
    const svg = await qrSvg(LINK);
    const { dark, size } = pixelsOf(svg);

    expect(svg).toContain('fill="#ffffff"');
    const cells = [...dark].map((cell) => cell.split(",").map(Number) as [number, number]);
    expect(Math.min(...cells.map(([x]) => x))).toBe(4);
    expect(Math.min(...cells.map(([, y]) => y))).toBe(4);
    expect(Math.max(...cells.map(([x]) => x))).toBe(size - 5);
    expect(Math.max(...cells.map(([, y]) => y))).toBe(size - 5);
  });
});
