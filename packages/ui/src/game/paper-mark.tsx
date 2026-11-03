import { cn } from "./cn";

type PaperMarkColor = "black" | "white";

type PaperMarkProps = {
  /** The side: black (the first player) is ×, white (the second player) is ○. */
  color: PaperMarkColor;
  /** Placed by the automaton: a lighter, broken line. */
  auto?: boolean;
  /** Not placed yet (the two-step selection): a lighter line. */
  preview?: boolean;
  /** On a small piece of paper, for use outside the sheet: dark ink would vanish on the dark page. */
  framed?: boolean;
  /** The name for a screen reader, e.g. "krzyżyk". Without it the mark is decoration and hidden from readers. */
  label?: string;
  className?: string;
};

// The shape carries the meaning, not the colour: × is two strokes, ○ an outline with a light fill.
function PaperMark({ color, auto = false, preview = false, framed = false, label, className }: PaperMarkProps) {
  const name = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  const mark = (
    <svg
      viewBox="0 0 24 24"
      {...(framed ? { "aria-hidden": true } : name)}
      className={cn(
        "block fill-none [stroke-width:var(--paper-mark-stroke)] [stroke-linecap:round]",
        auto || preview ? "stroke-paper-auto" : "stroke-paper-ink",
        auto && "[stroke-dasharray:var(--paper-mark-dash)]",
        framed ? "size-full" : className,
      )}
    >
      {color === "black" ? <path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" /> : <circle cx="12" cy="12" r="7.5" className="fill-paper-mark-fill" />}
    </svg>
  );
  if (!framed) return mark;
  return (
    <span
      {...name}
      className={cn("inline-block size-(--icon-size-md) shrink-0 rounded-base border border-border-control bg-paper-surface align-middle", className)}
    >
      {mark}
    </span>
  );
}

export { PaperMark };
export type { PaperMarkColor, PaperMarkProps };
