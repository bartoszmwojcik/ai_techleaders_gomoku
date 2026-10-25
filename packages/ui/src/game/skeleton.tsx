import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

// A grey block that holds the place of content that is still loading. It does not pulse for people who
// asked for reduced motion.
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-base bg-border-default motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

type SkeletonRegionProps = {
  /** Text announced to screen readers while loading, e.g. "Ładowanie listy partii". */
  label: string;
  children: ReactNode;
  className?: string;
};

// Wraps skeleton blocks: one polite announcement for the whole region, and aria-busy while loading.
function SkeletonRegion({ label, children, className }: SkeletonRegionProps) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-group", className)}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export { Skeleton, SkeletonRegion };
export type { SkeletonRegionProps };
