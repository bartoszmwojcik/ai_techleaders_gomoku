import type { ReactNode } from "react";

import { cn } from "./cn";

// A name on one line in a list row: the name is cut with an ellipsis when it does not fit, the
// fixed parts around it (a lead like "Ty: ", a tail like " (gość)") never shrink, and the full text
// is in `title` and in the markup, so assistive technology reads it all. No text is built in.
type TruncatedNameProps = {
  /** The part that is cut with an ellipsis: a nickname, a declared model name. */
  children: ReactNode;
  /** Fixed text before the name; never shrinks ("Ty: ", "Agent · "). */
  lead?: ReactNode;
  /** Fixed text after the name; never shrinks (" (gość)", " (deklarowane)"). */
  tail?: ReactNode;
  /** The whole label as one string, shown as a tooltip. */
  title?: string;
  className?: string;
  "data-testid"?: string;
};

function TruncatedName({ children, lead, tail, title, className, "data-testid": testId }: TruncatedNameProps) {
  return (
    <span className={cn("flex max-w-full min-w-0 items-baseline", className)} title={title} data-testid={testId}>
      {lead != null && <span className="shrink-0 whitespace-pre">{lead}</span>}
      <span className="min-w-0 truncate">{children}</span>
      {tail != null && <span className="shrink-0 whitespace-pre">{tail}</span>}
    </span>
  );
}

export { TruncatedName };
export type { TruncatedNameProps };
