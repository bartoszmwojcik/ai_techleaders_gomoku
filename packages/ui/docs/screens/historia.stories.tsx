import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { HistoryList, HistoryRow } from "@gomoku/ui/game/history-list";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { AgentName } from "./game-screen";
import { Screen, screenParameters } from "./screen";

const meta = {
  title: "Ekrany/Historia",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type HistoryState = "ready" | "many" | "loading" | "empty" | "error" | "long-guest" | "agents";

const noop = () => undefined;

// The app cuts a long nickname with an ellipsis and keeps "(gość)" visible (L30); the same wrapper here.
const LONG_NICK = "Bardzo_Dlugi_Nick_Goscia";
function GuestName({ nick }: { nick: string }) {
  return (
    <span className="flex min-w-0 max-w-full items-baseline" title={`${nick} (gość)`}>
      <span className="min-w-0 truncate">{nick}</span>
      <span className="shrink-0 whitespace-pre"> (gość)</span>
    </span>
  );
}

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
            <HistoryRow opponent="Alicja_99" result="win" resultLabel="Wygrana" date="24 października 2026, 18:30 CEST" reason="5 w linii" />
            <HistoryRow opponent="Kasia (gość)" result="loss" resultLabel="Porażka" date="23 października 2026, 09:12 CEST" reason="Koniec czasu" />
            <HistoryRow opponent="Usunięty gracz" result="draw" resultLabel="Remis" date="20 października 2026, 21:45 CEST" reason="Plansza pełna" />
          </HistoryList>
        )}
        {state === "long-guest" && (
          <>
            <HistoryList label="Zakończone partie">
              <HistoryRow opponent={<GuestName nick={LONG_NICK} />} result="win" resultLabel="Wygrana" date="31 października 2026, 16:04 CET" reason="5 w linii" />
              <HistoryRow opponent="Alicja_99" result="loss" resultLabel="Porażka" date="30 października 2026, 12:10 CET" reason="Poddanie" />
            </HistoryList>
            <div className="mt-stack">
              <Button variant="secondary" onClick={noop}>Pokaż starsze</Button>
            </div>
          </>
        )}
        {state === "agents" && (
          <HistoryList label="Zakończone partie">
            <HistoryRow opponent={<AgentName />} result="win" resultLabel="Wygrana" date="31 października 2026, 17:20 CET" reason="5 w linii" />
            <HistoryRow opponent={<AgentName declared="claude opus 5.5" />} result="loss" resultLabel="Porażka" date="31 października 2026, 16:40 CET" reason="Koniec czasu" />
            <HistoryRow opponent="Kasia (gość)" result="win" resultLabel="Wygrana" date="30 października 2026, 12:10 CET" reason="Poddanie" />
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
    await expect(canvas.getByText("Kasia (gość)")).toBeVisible();
  },
};
export const HistoriaGoscZDlugimNickiem: Story = {
  ...history("long-guest"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("(gość)")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Pokaż starsze" })).toBeVisible();
  },
};
export const HistoriaDuzoPartii: Story = history("many");
export const HistoriaLadowanie: Story = history("loading");
export const HistoriaPusta: Story = history("empty");
export const HistoriaBladWczytania: Story = history("error");
// Przeciwnik "Agent" (E06-S01, BR-31): bez nazwy i z deklarowaną nazwą modelu, obok gościa.
export const HistoriaZAgentem: Story = {
  ...history("agents"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("claude opus 5.5")).toBeVisible();
    await expect(canvas.getAllByText("Agent")).toHaveLength(2);
    await expect(canvas.getByText("Kasia (gość)")).toBeVisible();
  },
};
