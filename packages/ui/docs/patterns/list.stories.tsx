import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { HistoryList, HistoryRow } from "@gomoku/ui/game/history-list";
import { LobbyList, LobbyRow } from "@gomoku/ui/game/lobby-list";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Wzorce/Lista",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const noop = () => undefined;

function lobbyRows(count: number, longNames = false, partial = false) {
  return (
    <LobbyList label="Gracze szukający gry">
      {Array.from({ length: count }, (_, index) => {
        const name = longNames ? `Ala_Kowalska_Mistrzyni_Gomoku_2026_${index + 1}` : `Gracz_${index + 1}`;
        return (
          <LobbyRow
            key={name}
            name={name}
            since={partial && index % 2 ? undefined : `szuka od ${index + 1} min`}
            expiresLabel="wygasa za"
            expiresInMs={300_000 - index * 15_000}
            selectLabel="Zagraj"
            selectAriaLabel={`Zagraj z ${name}`}
            onSelect={noop}
          />
        );
      })}
    </LobbyList>
  );
}

function historyRows(count: number, longNames = false, partial = false) {
  return (
    <HistoryList label="Zakończone partie">
      {Array.from({ length: count }, (_, index) => (
        <HistoryRow
          key={index}
          opponent={index % 4 === 3 ? "Usunięty gracz" : index % 4 === 2 ? "Zaproszony przez link" : longNames ? `Ala_Kowalska_Mistrzyni_Gomoku_2026_${index + 1}` : `Gracz_${index + 1}`}
          result={(["win", "loss", "draw"] as const)[index % 3] as "win" | "loss" | "draw"}
          resultLabel={["Wygrana", "Porażka", "Remis"][index % 3]}
          date={`${25 - index}.10.2026`}
          reason={partial && index % 2 ? undefined : "5 w linii"}
        />
      ))}
    </HistoryList>
  );
}

function ListPanel({ kind, state }: { kind: "lobby" | "history"; state: "loading" | "empty" | "error" | "partial" | "many" | "long" | "ready" }) {
  const title = kind === "lobby" ? "Gracze szukający gry" : "Zakończone partie";
  const count = state === "many" ? 20 : state === "ready" || state === "long" || state === "partial" ? 3 : 0;
  const rows = kind === "lobby" ? lobbyRows(count, state === "long", state === "partial") : historyRows(count, state === "long", state === "partial");
  return (
    <Panel title={title} className="max-w-xl">
      {state === "loading" && (
        <SkeletonRegion label={`Ładowanie: ${title}`} className="gap-stack">
          {[0, 1, 2].map((row) => <Skeleton key={row} className="h-target" />)}
        </SkeletonRegion>
      )}
      {state === "empty" && (
        <EmptyState
          title={kind === "lobby" ? "Nikt teraz nie szuka gry" : "Nie rozegrałeś jeszcze żadnej partii"}
          action={<Button variant="secondary">{kind === "lobby" ? "Szukam przeciwnika" : "Utwórz zaproszenie"}</Button>}
        >
          {kind === "lobby" ? "Oznacz się jako szukający gry albo zaproś znajomego kodem." : "Zagraj ze znajomym, a zakończone partie pojawią się tutaj."}
        </EmptyState>
      )}
      {state === "error" && (
        <ErrorState title="Nie udało się wczytać listy" action={<Button variant="secondary">Spróbuj ponownie</Button>}>
          Sprawdź połączenie z internetem i spróbuj ponownie.
        </ErrorState>
      )}
      {count > 0 && rows}
    </Panel>
  );
}

export const LobbyLadowanie: Story = { render: () => <ListPanel kind="lobby" state="loading" /> };
export const LobbyPusto: Story = { render: () => <ListPanel kind="lobby" state="empty" /> };
export const LobbyBlad: Story = { render: () => <ListPanel kind="lobby" state="error" /> };
export const LobbyCzesciowaDane: Story = { render: () => <ListPanel kind="lobby" state="partial" /> };
export const LobbyDuzoDanych: Story = { render: () => <ListPanel kind="lobby" state="many" /> };
export const LobbyDlugieTeksty: Story = { render: () => <Narrow><ListPanel kind="lobby" state="long" /></Narrow> };

export const HistoriaLadowanie: Story = { render: () => <ListPanel kind="history" state="loading" /> };
export const HistoriaPusto: Story = { render: () => <ListPanel kind="history" state="empty" /> };
export const HistoriaBlad: Story = { render: () => <ListPanel kind="history" state="error" /> };
export const HistoriaCzesciowaDane: Story = { render: () => <ListPanel kind="history" state="partial" /> };
export const HistoriaDuzoDanych: Story = { render: () => <ListPanel kind="history" state="many" /> };
export const HistoriaDlugieTeksty: Story = { render: () => <Narrow><ListPanel kind="history" state="long" /></Narrow> };

export const PustaListaMaPowodINastepnyKrok: Story = {
  render: () => <ListPanel kind="history" state="empty" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Nie rozegrałeś jeszcze żadnej partii")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Utwórz zaproszenie" })).toBeVisible();
  },
};
