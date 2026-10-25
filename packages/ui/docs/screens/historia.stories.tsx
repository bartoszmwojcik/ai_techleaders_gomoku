import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { HistoryList, HistoryRow } from "@gomoku/ui/game/history-list";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Screen, screenParameters } from "./screen";

const meta = {
  title: "Ekrany/Historia",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type HistoryState = "ready" | "many" | "loading" | "empty" | "error";

const noop = () => undefined;

function History({ state }: { state: HistoryState }) {
  return (
    <Screen viewer="player">
      <h1 className="m-0 text-section font-strong">Historia partii</h1>
      <Panel title="Zakończone partie" className="max-w-xl">
        {state === "loading" && (
          <SkeletonRegion label="Ładowanie historii partii" className="gap-stack">
            {[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-target" />)}
          </SkeletonRegion>
        )}
        {state === "empty" && (
          <EmptyState title="Nie rozegrałeś jeszcze żadnej partii" action={<Button>Utwórz zaproszenie</Button>}>
            Zagraj ze znajomym albo wybierz przeciwnika w lobby, a zakończone partie pojawią się tutaj.
          </EmptyState>
        )}
        {state === "error" && (
          <ErrorState title="Nie udało się wczytać historii" action={<Button variant="secondary" onClick={noop}>Spróbuj ponownie</Button>}>
            Sprawdź połączenie z internetem i spróbuj ponownie.
          </ErrorState>
        )}
        {state === "ready" && (
          <HistoryList label="Zakończone partie">
            <HistoryRow opponent="Alicja_99" result="win" resultLabel="Wygrana" date="24.10.2026" reason="5 w linii" />
            <HistoryRow opponent="Zaproszony przez link" result="loss" resultLabel="Porażka" date="23.10.2026" reason="Koniec czasu" />
            <HistoryRow opponent="Usunięty gracz" result="draw" resultLabel="Remis" date="20.10.2026" reason="Plansza pełna" />
          </HistoryList>
        )}
        {state === "many" && (
          <HistoryList label="Zakończone partie">
            {Array.from({ length: 25 }, (_, index) => (
              <HistoryRow
                key={index}
                opponent={`Gracz_${index + 1}`}
                result={(["win", "loss", "draw"] as const)[index % 3] as "win" | "loss" | "draw"}
                resultLabel={["Wygrana", "Porażka", "Remis"][index % 3]}
                date={`${25 - index}.09.2026`}
                reason="5 w linii"
              />
            ))}
          </HistoryList>
        )}
      </Panel>
    </Screen>
  );
}

const history = (state: HistoryState): Story => ({ render: () => <History state={state} /> });

export const HistoriaZPartiami: Story = {
  ...history("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Usunięty gracz")).toBeVisible();
    await expect(canvas.getByText("Zaproszony przez link")).toBeVisible();
  },
};
export const HistoriaDuzoPartii: Story = history("many");
export const HistoriaLadowanie: Story = history("loading");
export const HistoriaPusta: Story = history("empty");
export const HistoriaBladWczytania: Story = history("error");
