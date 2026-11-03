import { Button } from "@gomoku/ui/game/button";
import { PaperBoard, type PaperBoardLabels, type PaperFive, type PaperStone, type Point } from "@gomoku/ui/game/paper-board";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const STATE_WORD = { empty: "puste", black: "krzyżyk", white: "kółko" } as const;

const labels: PaperBoardLabels = {
  board: "Plansza bez granic",
  cell: ({ x, y, state, allowed, last, auto, selected }) =>
    [
      `Pole ${x}, ${y}`,
      STATE_WORD[state],
      !allowed && state === "empty" ? "za daleko" : "",
      last ? "ostatni ruch" : "",
      auto ? "ruch automatu" : "",
      selected ? "zaznaczone" : "",
    ]
      .filter(Boolean)
      .join(", "),
  notAllowed: "Za daleko od znaków: znak można postawić najwyżej 3 pola od innego.",
  autoMoved: ({ x, y }) => `Automat postawił znak na polu ${x}, ${y}`,
  opponentMarker: ({ dx, dy }) => `Ruch przeciwnika ${dx < 0 ? "←" : dx > 0 ? "→" : ""}${dy < 0 ? "↑" : dy > 0 ? "↓" : ""}`,
  toolbar: "Przesuwanie i powiększanie planszy",
  level: (level) => `${level} × ${level} pól`,
  zoomIn: "Przybliż",
  zoomOut: "Oddal",
  center: "Wyśrodkuj",
  panLeft: "Przesuń widok w lewo",
  panRight: "Przesuń widok w prawo",
  panUp: "Przesuń widok w górę",
  panDown: "Przesuń widok w dół",
  selectionBar: "Przesuwanie zaznaczenia",
  selectionLeft: "Zaznaczenie w lewo",
  selectionRight: "Zaznaczenie w prawo",
  selectionUp: "Zaznaczenie w górę",
  selectionDown: "Zaznaczenie w dół",
};

const colors = { 1: "black", 2: "white" } as const;

const stone = (x: number, y: number, seat: 1 | 2, auto = false): PaperStone => ({ x, y, seat, auto });
/** Positions are absolute: the start is 50, 50. */
const OPENING: readonly PaperStone[] = [stone(50, 50, 1), stone(51, 50, 2), stone(51, 51, 1), stone(49, 49, 2), stone(52, 52, 1)];
const WITH_FIVE: readonly PaperStone[] = [
  ...[48, 49, 50, 51, 52].map((x) => stone(x, 50, 1)),
  stone(48, 51, 2),
  stone(49, 51, 2),
  stone(50, 51, 2, true),
  stone(51, 52, 2),
];
const FIVES: readonly PaperFive[] = [{ seat: 1, from: { x: 48, y: 50 }, to: { x: 52, y: 50 } }];

function nearAStone(stones: readonly PaperStone[]) {
  return ({ x, y }: Point) => stones.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) <= 3);
}

const meta = {
  title: "Produkt/Partia/Plansza papier i ołówek",
  component: PaperBoard,
  args: {
    stones: OPENING,
    colors,
    labels,
    layout: "desktop",
    allowed: nearAStone(OPENING),
    lastMove: { x: 52, y: 52 },
    onSelect: fn(),
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof PaperBoard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Pusta: Story = { args: { stones: [], lastMove: undefined, allowed: undefined } };

export const PiatkaPrzekreslonaOlowkiem: Story = {
  args: { stones: WITH_FIVE, fives: FIVES, lastMove: { x: 52, y: 50 }, allowed: nearAStone(WITH_FIVE) },
};

export const RuchAutomatu: Story = {
  args: { stones: WITH_FIVE, fives: FIVES, lastMove: { x: 50, y: 51 }, allowed: nearAStone(WITH_FIVE) },
};

export const RuchPrzeciwnikaPozaOknem: Story = {
  args: { stones: [...OPENING, stone(70, 48, 2)], opponentMove: { x: 70, y: 48 }, lastMove: { x: 70, y: 48 } },
};

/** Measured against the sheet, in both themes (the stories run once per theme). */
export const ZnakiZaznaczoneNaKartce: Story = {
  args: {
    stones: [stone(50, 50, 1), stone(51, 50, 2), stone(50, 51, 1, true), stone(51, 51, 2, true)],
    lastMove: { x: 51, y: 51 },
    selection: { x: 52, y: 50 },
    selectionSeat: 1,
    allowed: nearAStone([stone(50, 50, 1)]),
    layout: "phone",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Pole 0, 0, krzyżyk/ }).querySelector("path")).toBeTruthy();
    await expect(canvas.getByRole("button", { name: /Pole 1, 0, kółko/ }).querySelector("circle")).toBeTruthy();
    await expect(canvas.getByRole("button", { name: /Pole 1, 1, kółko, ostatni ruch, ruch automatu/ })).toBeTruthy();
    await expect(canvas.getByRole("button", { name: /Pole 2, 0, puste.*zaznaczone/ }).querySelector("path")).toBeTruthy();
  },
};

export const TylkoDoOdczytu: Story = { args: { disabled: true } };

export const KrawedzPlanszy: Story = {
  args: { stones: [stone(1, 1, 1), stone(2, 2, 2)], allowed: undefined, lastMove: undefined, layout: "phone" },
};

function TwoStepPhone() {
  const [placed, setPlaced] = useState<readonly PaperStone[]>(OPENING);
  const [selection, setSelection] = useState<Point | undefined>({ x: 52, y: 52 });
  const allowed = nearAStone(placed);
  const occupied = (point: Point) => placed.some((s) => s.x === point.x && s.y === point.y);
  const canPlace = selection !== undefined && !occupied(selection) && allowed(selection);
  return (
    <Narrow>
      <div className="flex flex-col gap-2">
        <PaperBoard
          stones={placed}
          colors={colors}
          labels={labels}
          layout="phone"
          allowed={allowed}
          lastMove={{ x: 52, y: 52 }}
          selection={selection}
          onSelect={setSelection}
        />
        <Button
          disabled={!canPlace}
          onClick={() => {
            if (!selection || !canPlace) return;
            setPlaced([...placed, stone(selection.x, selection.y, 2)]);
            setSelection(undefined);
          }}
        >
          Postaw kółko
        </Button>
      </div>
    </Narrow>
  );
}

export const WaskiEkran320ZPaskiemDotykowym: Story = {
  render: () => <TwoStepPhone />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = canvas.getByRole("group", { name: "Przesuwanie zaznaczenia" });
    const buttons = within(bar).getAllByRole("button");
    await expect(buttons).toHaveLength(6);
    for (const button of buttons) {
      const { width, height } = button.getBoundingClientRect();
      await expect(width).toBeGreaterThanOrEqual(44);
      await expect(height).toBeGreaterThanOrEqual(44);
    }
    await expect(bar.getBoundingClientRect().width).toBeLessThanOrEqual(288);
    const grid = canvas.getByRole("grid").getBoundingClientRect();
    await expect(Math.abs(grid.width - grid.height)).toBeLessThan(2);
  },
};

export const ZaznaczenieRuszaSiePrzyciskami: Story = {
  render: () => <TwoStepPhone />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const place = canvas.getByRole("button", { name: "Postaw kółko" });
    // The selection starts on the opponent's last stone, which is occupied: nothing to confirm yet.
    await expect(place).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Zaznaczenie w prawo" }));
    await expect(place).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Zaznaczenie w dół" }));
    await expect(canvas.getByRole("button", { name: /Pole 3, 3, .*zaznaczone/ })).toBeTruthy();
    await userEvent.click(place);
    await expect(canvas.getByRole("button", { name: "Pole 3, 3, kółko" })).toBeTruthy();
  },
};

/** Measured, not assumed: the word stays inside its button and the bar does not scroll sideways at 320 px. */
export const PasekNarzedziWaski320: Story = {
  render: (args) => (
    <Narrow>
      <PaperBoard {...args} />
    </Narrow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toolbar = canvas.getByRole("toolbar");
    const center = canvas.getByRole("button", { name: "Wyśrodkuj" });
    await expect(center.scrollWidth).toBeLessThanOrEqual(center.clientWidth);
    const box = center.getBoundingClientRect();
    await expect(box.height).toBeGreaterThanOrEqual(44);
    for (const other of within(toolbar).getAllByRole("button")) {
      if (other === center) continue;
      const rect = other.getBoundingClientRect();
      const overlaps = rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
      await expect(overlaps).toBe(false);
    }
    await expect(toolbar.scrollWidth).toBeLessThanOrEqual(toolbar.clientWidth);
  },
};

export const KartkaNajwiekszyPoziom: Story = {
  args: { storageKey: "story.paper-board.level-31" },
  beforeEach: () => {
    window.localStorage.setItem("story.paper-board.level-31", "31");
    return () => window.localStorage.removeItem("story.paper-board.level-31");
  },
};

export const KartkaNajmniejszyPoziomWaska: Story = {
  args: { layout: "phone" },
  render: (args) => (
    <Narrow>
      <PaperBoard {...args} />
    </Narrow>
  ),
};

export const PrzyciskiPowiekszania: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("21 × 21 pól")).toBeTruthy();
    await userEvent.click(canvas.getByRole("button", { name: "Przybliż" }));
    await expect(canvas.getByText("19 × 19 pól")).toBeTruthy();
    await expect(within(canvas.getByRole("grid")).getAllByRole("button")).toHaveLength(19 * 19);
  },
};

export const PolaNiedozwoloneSaNieaktywne: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const far = canvas.getByRole("button", { name: "Pole 9, 9, puste, za daleko" });
    await expect(far).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(far);
    await expect(args.onSelect).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Pole 3, 0, puste" }));
    await expect(args.onSelect).toHaveBeenCalledWith({ x: 53, y: 50 });
  },
};
