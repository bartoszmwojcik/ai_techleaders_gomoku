import type { ReactNode } from "react";

import { cn } from "./cn";
import type { StoneColor } from "./board";

type TurnStatusProps = {
  /** Whose turn it is in words, e.g. "Twój ruch (czarne)" (required). Colour is never the only sign. */
  children: ReactNode;
  /** The stone colour shown next to the words. */
  color?: StoneColor;
  className?: string;
};

// A polite live line above the board; the words carry the meaning, the stone is only a reminder.
function TurnStatus({ children, color, className }: TurnStatusProps) {
  return (
    <p role="status" className={cn("m-0 flex items-center gap-group text-body font-strong text-text-primary", className)}>
      {color && (
        <span
          aria-hidden="true"
          className={cn(
            // The marker sits on the page surface, not on the board: `piece-outline` is as dark as the black stone and
            // as the dark page, so the black stone vanished in the dark theme; the control border shows in both.
            "size-(--icon-size-md) shrink-0 rounded-piece border border-border-control",
            color === "black" ? "bg-piece-black" : "bg-piece-white",
          )}
        />
      )}
      {children}
    </p>
  );
}

export { TurnStatus };
export type { TurnStatusProps };
