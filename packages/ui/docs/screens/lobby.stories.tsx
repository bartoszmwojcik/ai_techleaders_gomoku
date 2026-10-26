import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { LobbyList, LobbyRow } from "@gomoku/ui/game/lobby-list";
import { Panel } from "@gomoku/ui/game/panel";
import { SeekingStatus } from "@gomoku/ui/game/seeking-status";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Screen, screenParameters } from "./screen";

const meta = {
  title: "Ekrany/Lobby",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type LobbyState = "idle" | "seeking" | "picking" | "taken" | "loading" | "empty" | "error" | "has-active-game";

const noop = () => undefined;

const rows = (selecting?: string) => (
  <LobbyList label="Gracze szukający gry">
    {[
      ["Alicja_99", "szuka od 1 min", 242_000],
      ["czarny_kamień", "szuka od 3 min", 130_000],
      ["PiątkaWLinii", "szuka od 4 min", 48_000],
    ].map(([name, since, ms]) => (
      <LobbyRow
        key={name as string}
        name={name}
        since={since}
        expiresLabel="wygasa za"
        expiresInMs={ms as number}
        selectLabel="Zagraj"
        selectAriaLabel={`Zagraj z ${name}`}
        selecting={selecting === name}
        onSelect={noop}
      />
    ))}
  </LobbyList>
);

function Lobby({ state }: { state: LobbyState }) {
  return (
    <Screen viewer="player">
      <h1 className="m-0 text-section font-strong">Lobby</h1>
      {state === "has-active-game" ? (
        <>
          <Alert status="warning" title="Masz już partię">Możesz grać tylko jedną partię naraz.</Alert>
          <TextLink href="#partia" placement="standalone">Wróć do swojej partii</TextLink>
        </>
      ) : (
        <div className="flex max-w-xl flex-col gap-stack">
          {state === "seeking" || state === "picking" || state === "taken" ? (
            <SeekingStatus title="Szukasz gry" expiresLabel="Status wygasa za" expiresInMs={272_000} withdrawLabel="Wycofaj" onWithdraw={noop} />
          ) : (
            <div><Button>Szukam przeciwnika</Button></div>
          )}
          {state === "taken" && (
            <Alert status="warning" title="Ten gracz zagrał już z kimś innym">Wybierz kogoś innego z listy.</Alert>
          )}
          <Panel title="Gracze szukający gry">
            {state === "loading" && (
              <SkeletonRegion label="Ładowanie lobby" className="gap-stack">
                {[0, 1, 2].map((row) => <Skeleton key={row} className="h-target" />)}
              </SkeletonRegion>
            )}
            {state === "empty" && (
              <EmptyState title="Nikt teraz nie szuka gry" action={<Button variant="secondary">Szukam przeciwnika</Button>}>
                Oznacz się jako szukający gry, a pojawisz się tu na 5 minut, albo zaproś znajomego kodem.
              </EmptyState>
            )}
            {state === "error" && (
              <ErrorState title="Nie udało się wczytać lobby" action={<Button variant="secondary">Spróbuj ponownie</Button>}>
                Sprawdź połączenie z internetem i spróbuj ponownie.
              </ErrorState>
            )}
            {(state === "idle" || state === "seeking" || state === "taken") && rows()}
            {state === "picking" && rows("Alicja_99")}
          </Panel>
        </div>
      )}
    </Screen>
  );
}

const lobby = (state: LobbyState): Story => ({ render: () => <Lobby state={state} /> });

export const LobbyNieSzukam: Story = lobby("idle");
export const LobbySzukam: Story = {
  ...lobby("seeking"),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("4:32")).toBeVisible();
  },
};
export const LobbyWybieranieTrwa: Story = lobby("picking");
export const LobbyGraczZajetyPrzedWyborem: Story = lobby("taken");
export const LobbyLadowanie: Story = lobby("loading");
export const LobbyPuste: Story = lobby("empty");
export const LobbyBladWczytania: Story = lobby("error");
export const LobbyMaAktywnaPartie: Story = lobby("has-active-game");
