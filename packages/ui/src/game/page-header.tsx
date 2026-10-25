import type { ReactNode } from "react";

import { cn } from "./cn";

// The header of every player page: the product name as a link home, optional navigation, and the
// actions on the right (R02.1: a clear login button). A thin line below, no shadow (A02).
type PageHeaderProps = {
  /** The product name or logo, as text (required). It is the link to the home page. */
  brand: ReactNode;
  homeHref?: string;
  /** Links to the main places, e.g. Lobby and Historia. */
  navigation?: ReactNode;
  /** Accessible name of the navigation, e.g. "Główna nawigacja"; required with navigation. */
  navigationLabel?: string;
  /** The actions on the right: Zaloguj się, Konto, Wyloguj. */
  children?: ReactNode;
  className?: string;
};

function PageHeader({ brand, homeHref = "/", navigation, navigationLabel, children, className }: PageHeaderProps) {
  return (
    <header className={cn("border-b border-border-default", className)}>
      <div className="mx-auto flex max-w-(--layout-width-content) flex-wrap items-center justify-between gap-stack px-panel py-4">
        <a
          href={homeHref}
          className="motion-fast inline-flex min-h-target items-center rounded-base text-subsection font-strong text-text-primary transition-colors hover:text-text-accent focus-visible:focus-ring"
        >
          {brand}
        </a>
        {navigation && (
          <nav aria-label={navigationLabel} className="flex flex-wrap items-center gap-stack">
            {navigation}
          </nav>
        )}
        {children && <div className="flex flex-wrap items-center gap-group">{children}</div>}
      </div>
    </header>
  );
}

export { PageHeader };
export type { PageHeaderProps };
