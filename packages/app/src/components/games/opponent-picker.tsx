"use client";

import type { GameVariant } from "@gomoku/core/games/paper/constants";
import { ChoiceGroup } from "@gomoku/ui/game/choice-group";

import {
  BOT_CLASSIC_ONLY_TEXT,
  BOT_LEVEL_OPTIONS,
  OPPONENT_OPTIONS,
  botLevelOf,
  opponentOf,
  playsBot,
  type OpponentSetting,
} from "@/lib/games/opponent";

type Props = {
  value: OpponentSetting;
  /** The bot plays only the classic game (BR-56): with the paper game the group is off and says why. */
  variant: GameVariant;
  onChange: (next: OpponentSetting) => void;
  disabled?: boolean;
};

/**
 * "Przeciwnik" and, for the bot, "Poziom bota" (hosted-bot spec, UI/UX): radio groups with 44 px targets.
 * The level group always shows: there are two levels from the first release (BR-55, `BOT_LEVELS`).
 */
export function OpponentPicker({ value, variant, onChange, disabled }: Props) {
  const classic = variant === "classic";
  const bot = playsBot(value, variant);
  return (
    <div className="flex flex-col gap-stack" data-testid="opponent-settings">
      <div className="flex flex-col gap-1">
        <ChoiceGroup
          label="Przeciwnik"
          options={OPPONENT_OPTIONS}
          value={bot ? "bot" : "human"}
          onValueChange={(next) => onChange({ ...value, opponent: opponentOf(next) })}
          disabled={disabled || !classic}
          data-testid="settings-opponent"
        />
        {!classic && (
          // A disabled choice says why next to it (design system, rule 7).
          <p className="m-0 text-meta text-text-secondary" data-testid="bot-classic-only">
            {BOT_CLASSIC_ONLY_TEXT}
          </p>
        )}
      </div>
      {bot && (
        <ChoiceGroup
          label="Poziom bota"
          options={BOT_LEVEL_OPTIONS}
          value={String(value.botLevel)}
          onValueChange={(next) => onChange({ ...value, botLevel: botLevelOf(next) })}
          disabled={disabled}
          data-testid="settings-bot-level"
        />
      )}
    </div>
  );
}
