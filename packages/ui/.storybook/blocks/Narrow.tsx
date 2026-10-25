import type { ReactNode } from "react";

/** A 320 px wide frame, the narrowest phone width (BR-20). */
export function Narrow({ children }: { children: ReactNode }) {
  return <div className="w-[320px] max-w-full rounded-base border border-border-default p-4">{children}</div>;
}
