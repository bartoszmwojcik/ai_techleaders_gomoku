"use client";

import type { GameVariant } from "@gomoku/core/games/paper/constants";
import { ChoiceGroup } from "@gomoku/ui/game/choice-group";

import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
import {
  botLevelOf,
  botLevelOptions,
  opponentOptions,
  opponentOf,
  playsBot,
  type OpponentSetting,
} from "@/lib/games/opponent";

type Props = TextsProps<"home"> & {
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
export function OpponentPicker({ value, variant, onChange, disabled, ...texts }: Props) {
  const t = textsOf<"home">(plHome, texts);
  const classic = variant === "classic";
  const bot = playsBot(value, variant);
  return (
    <div className="flex flex-col gap-stack" data-testid="opponent-settings">
      <div className="flex flex-col gap-1">
        <ChoiceGroup
          label={t("opponent.label")}
          options={opponentOptions(t)}
          value={bot ? "bot" : "human"}
          onValueChange={(next) => onChange({ ...value, opponent: opponentOf(next) })}
          disabled={disabled || !classic}
          data-testid="settings-opponent"
        />
        {!classic && (
          // A disabled choice says why next to it (design system, rule 7).
          <p className="m-0 text-meta text-text-secondary" data-testid="bot-classic-only">
            {t("opponent.classicOnly")}
          </p>
        )}
      </div>
      {bot && (
        <ChoiceGroup
          label={t("opponent.levelLabel")}
          options={botLevelOptions(t)}
          value={String(value.botLevel)}
          onValueChange={(next) => onChange({ ...value, botLevel: botLevelOf(next) })}
          disabled={disabled}
          data-testid="settings-bot-level"
        />
      )}
    </div>
  );
}
