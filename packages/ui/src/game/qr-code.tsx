import type { ReactNode } from "react";

import { cn } from "./cn";

type QrCodeProps = {
  /** Address of the image. It brings its own light background and quiet zone, so a reader copes in both themes. */
  src: string;
  /** What a screen reader says instead of the code (required, passed in). */
  label: string;
  /** What to do with the code, under it. */
  caption?: ReactNode;
  className?: string;
};

// A code to scan with a phone. The image is not drawn here: the app makes it, and the colours stay out of the tokens on purpose.
function QrCode({ src, label, caption, className }: QrCodeProps) {
  return (
    <figure className={cn("m-0 flex w-(--layout-width-qr) max-w-full flex-col gap-group", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG of the app's own route; nothing for an image optimiser to do */}
      <img src={src} alt={label} className="block aspect-square w-full rounded-base" />
      {caption && <figcaption className="text-meta text-text-secondary">{caption}</figcaption>}
    </figure>
  );
}

export { QrCode };
export type { QrCodeProps };
