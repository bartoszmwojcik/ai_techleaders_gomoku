"use client";

import type { GameVariant } from "@gomoku/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { homeRulesLabel } from "@/lib/games/settings";

type HomeRules = { variant: GameVariant; setVariant: (variant: GameVariant) => void };

// Outside a provider (a visitor who cannot choose, tests of other components) the choice is a no-op.
const HomeRulesContext = createContext<HomeRules>({ variant: "classic", setVariant: () => {} });

/** Shares the variant picked in the create-game form with the rules line next to it. */
export function HomeRulesProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<GameVariant>("classic");
  const value = useMemo(() => ({ variant, setVariant }), [variant]);
  return <HomeRulesContext.Provider value={value}>{children}</HomeRulesContext.Provider>;
}

export const useHomeRules = () => useContext(HomeRulesContext);

/** The rules line under the title; follows the chosen variant at once and is announced politely. */
export function HomeRulesLine() {
  const { variant } = useHomeRules();
  return (
    <p className="text-meta text-text-muted" aria-live="polite" data-testid="home-rules">
      {homeRulesLabel(variant)}
    </p>
  );
}
