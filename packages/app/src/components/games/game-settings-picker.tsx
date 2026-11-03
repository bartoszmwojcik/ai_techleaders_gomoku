"use client";

import { ChoiceGroup } from "@gomoku/ui/game/choice-group";

import { TIME_OPTIONS, VARIANT_OPTIONS, variantOf, type GameSettingsChoice } from "@/lib/games/settings";

type Props = {
  value: GameSettingsChoice;
  onChange: (next: GameSettingsChoice) => void;
  disabled?: boolean;
};

/** "Wariant" and, for the paper game, "Czas na gracza" (E11, BR-46): radio groups with 44 px targets. */
export function GameSettingsPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-stack" data-testid="game-settings">
      <ChoiceGroup
        label="Wariant"
        options={VARIANT_OPTIONS}
        value={value.variant}
        onValueChange={(next) => onChange({ ...value, variant: variantOf(next) })}
        disabled={disabled}
        data-testid="settings-variant"
      />
      {value.variant === "paper" && (
        <ChoiceGroup
          label="Czas na gracza"
          options={TIME_OPTIONS}
          value={String(value.timeControlMs)}
          onValueChange={(next) => onChange({ ...value, timeControlMs: Number(next) })}
          disabled={disabled}
          data-testid="settings-time"
        />
      )}
    </div>
  );
}
