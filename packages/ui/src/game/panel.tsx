import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "./cn";

// A raised area with a thin border and no shadow (A02): panels are told apart by tone and line.
type PanelProps = Omit<ComponentProps<"section">, "title"> & {
  /** Heading of the panel; when given, the panel is a labelled region. */
  title?: ReactNode;
  /** Heading level, so the panel fits the page outline. */
  headingLevel?: 2 | 3 | 4;
  children?: ReactNode;
};

function Panel({ title, headingLevel = 2, className, children, ...props }: PanelProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn("flex min-w-0 flex-col gap-stack wrap-anywhere rounded-base border border-border-default bg-surface-raised p-panel", className)}
      {...props}
    >
      {title && (
        <Heading id={headingId} className="m-0 text-subsection font-strong text-text-primary">
          {title}
        </Heading>
      )}
      {children}
    </section>
  );
}

export { Panel };
export type { PanelProps };
