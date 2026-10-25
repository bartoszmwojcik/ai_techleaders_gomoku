import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

type DoDontProps = { good: ReactNode; goodNote: string; bad: ReactNode; badNote: string };

/** A pair of examples side by side. Each side has an icon and a word, never colour alone. */
export function DoDont({ good, goodNote, bad, badNote }: DoDontProps) {
  return (
    <div className="grid grid-cols-1 gap-stack md:grid-cols-2">
      <figure className="m-0 flex flex-col gap-group rounded-base border border-border-default bg-surface-page p-4 text-text-primary">
        <div className="min-h-[var(--space-12)]">{good}</div>
        <figcaption className="flex items-start gap-group text-meta text-status-success">
          <Check aria-hidden="true" className="size-(--icon-size-sm) shrink-0" />
          <span><strong>Dobrze:</strong> {goodNote}</span>
        </figcaption>
      </figure>
      <figure className="m-0 flex flex-col gap-group rounded-base border border-border-default bg-surface-page p-4 text-text-primary">
        <div className="min-h-[var(--space-12)]">{bad}</div>
        <figcaption className="flex items-start gap-group text-meta text-status-danger">
          <X aria-hidden="true" className="size-(--icon-size-sm) shrink-0" />
          <span><strong>Źle:</strong> {badNote}</span>
        </figcaption>
      </figure>
    </div>
  );
}
