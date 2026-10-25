import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";
import { cellLabel, MIDGAME, MIDGAME_LAST_MOVE, OPENING, WIN_LINE, WON_GAME, WON_LAST_MOVE } from "../shared";

const meta = {
  title: "Produkt/Partia/Plansza",
  component: Board,
  args: { label: "Plansza 15 na 15", cellLabel, stones: OPENING, onCellSelect: fn() },
  parameters: { layout: "padded" },
} satisfies Meta<typeof Board>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Pusta: Story = { args: { stones: [] } };

export const TrwaPartiaZOstatnimRuchem: Story = { args: { stones: MIDGAME, lastMove: MIDGAME_LAST_MOVE } };

export const KoniecZLiniaWygrywajaca: Story = {
  args: { stones: WON_GAME, lastMove: WON_LAST_MOVE, winLine: WIN_LINE, readOnly: true },
};

export const RuchPrzeciwnikaTylkoDoOdczytu: Story = { args: { stones: MIDGAME, lastMove: MIDGAME_LAST_MOVE, readOnly: true } };

export const WybranePoleNaTelefonie: Story = {
  args: { stones: OPENING, selected: { cell: 7 * 15 + 10, color: "black" } },
};

function TwoStepBoard({ stones }: { stones: typeof OPENING }) {
  const [selected, setSelected] = useState<number | undefined>();
  const [placed, setPlaced] = useState(stones);
  return (
    <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
      <Board
        label="Plansza 15 na 15"
        cellLabel={cellLabel}
        stones={placed}
        selected={selected === undefined ? undefined : { cell: selected, color: "black" }}
        onCellSelect={setSelected}
      />
      <Button
        disabled={selected === undefined}
        onClick={() => {
          if (selected === undefined) return;
          setPlaced([...placed, { cell: selected, color: "black" }]);
          setSelected(undefined);
        }}
      >
        Postaw kamień
      </Button>
      {selected === undefined && <p className="m-0 text-meta text-text-muted">Zaznacz pole na planszy, aby postawić kamień.</p>}
    </div>
  );
}

export const DwaKrokiNaEkranieDotykowym: Story = {
  render: (args) => <TwoStepBoard stones={args.stones} />,
};

export const WaskiEkran320: Story = {
  render: (args) => (
    <Narrow>
      <Board {...args} stones={MIDGAME} lastMove={MIDGAME_LAST_MOVE} />
    </Narrow>
  ),
};

export const WszystkiePolaMieszczaSieWPlanszyNaTelefonie: Story = {
  render: (args) => (
    <Narrow>
      <Board {...args} stones={MIDGAME} />
    </Narrow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole("grid").getBoundingClientRect();
    const first = canvas.getByRole("button", { name: "Kolumna A, rząd 1, puste" }).getBoundingClientRect();
    const last = canvas.getByRole("button", { name: "Kolumna O, rząd 15, puste" }).getBoundingClientRect();
    await expect(first.left).toBeGreaterThanOrEqual(grid.left);
    await expect(last.right).toBeLessThanOrEqual(grid.right);
    await expect(last.bottom).toBeLessThanOrEqual(grid.bottom);
    // A square board: the last cell sits at the bottom right corner, not shifted by a hidden label column.
    await expect(Math.abs(grid.right - last.right)).toBeLessThan(24);
    // Square cells and a square board: a hidden coordinate label must not make the rows taller.
    await expect(Math.abs(first.width - first.height)).toBeLessThan(1);
    await expect(Math.abs(grid.width - grid.height)).toBeLessThan(2);
  },
};

export const ZaznaczaPustePoleKlawiatura: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const center = canvas.getByRole("button", { name: "Kolumna H, rząd 8, czarny kamień" });
    center.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    await expect(canvas.getByRole("button", { name: "Kolumna K, rząd 8, puste" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onCellSelect).toHaveBeenCalledWith(7 * 15 + 10);
  },
};

export const ZajetePoleNieReaguje: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Kolumna H, rząd 8, czarny kamień" }));
    await expect(args.onCellSelect).not.toHaveBeenCalled();
  },
};
