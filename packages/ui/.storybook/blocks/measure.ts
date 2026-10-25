import type { Theme } from "../theme";

export type Rgb = { r: number; g: number; b: number };

/** Resolves a CSS custom property to the colour the browser actually paints in the given theme. */
export function resolveColor(token: string, theme: Theme): Rgb {
  const scope = document.createElement("div");
  scope.dataset.theme = theme;
  const probe = document.createElement("span");
  probe.style.color = `var(--${token})`;
  scope.appendChild(probe);
  document.body.appendChild(scope);
  const [r = 0, g = 0, b = 0] = (getComputedStyle(probe).color.match(/[\d.]+/g) ?? []).map(Number);
  scope.remove();
  return { r, g, b };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads a non-colour custom property (spacing, radius, duration, ...) as written. */
export function readValue(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
}
