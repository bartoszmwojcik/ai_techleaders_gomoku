"use client";

import { ChoiceGroup } from "@gomoku/ui/game/choice-group";

import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
import { timeOptions, variantOf, variantOptions, type GameSettingsChoice } from "@/lib/games/settings";

type Props = TextsProps<"home"> & {
  value: GameSettingsChoice;
  onChange: (next: GameSettingsChoice) => void;
  disabled?: boolean;
};

/** "Wariant" and, for the paper game, "Czas na gracza" (E11, BR-46): radio groups with 44 px targets. */
export function GameSettingsPicker({ value, onChange, disabled, ...texts }: Props) {
  const t = textsOf<"home">(plHome, texts);
  return (
    <div className="flex flex-col gap-stack" data-testid="game-settings">
      <ChoiceGroup
        label={t("settings.variant")}
        options={variantOptions(t)}
        value={value.variant}
        onValueChange={(next) => onChange({ ...value, variant: variantOf(next) })}
        disabled={disabled}
        data-testid="settings-variant"
      />
      {value.variant === "paper" && (
        <ChoiceGroup
          label={t("settings.time")}
          options={timeOptions(t)}
          value={String(value.timeControlMs)}
          onValueChange={(next) => onChange({ ...value, timeControlMs: Number(next) })}
          disabled={disabled}
          data-testid="settings-time"
        />
      )}
    </div>
  );
}
