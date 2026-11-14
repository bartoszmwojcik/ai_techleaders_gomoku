"use client";

import { GAME_VARIANTS, type GameVariant } from "@gomoku/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
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

/**
 * The rules line under the title; follows the chosen variant at once and is announced politely. Every variant's text
 * sits hidden in the same grid cell, so the row keeps the height of the longest at any width and nothing below it jumps.
 */
export function HomeRulesLine(texts: TextsProps<"home">) {
  const { variant } = useHomeRules();
  const t = textsOf<"home">(plHome, texts);
  return (
    <div className="grid">
      {GAME_VARIANTS.map((reserved) => (
        <span key={reserved} aria-hidden="true" className="invisible col-start-1 row-start-1 text-meta">
          {homeRulesLabel(reserved, t)}
        </span>
      ))}
      <p className="col-start-1 row-start-1 text-meta text-text-muted" aria-live="polite" data-testid="home-rules">
        {homeRulesLabel(variant, t)}
      </p>
    </div>
  );
}
