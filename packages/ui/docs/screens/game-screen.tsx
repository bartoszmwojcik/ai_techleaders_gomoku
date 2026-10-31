import { Alert } from "@gomoku/ui/game/alert";
import { Board, type Stone } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { GameResultBanner, type GameResult } from "@gomoku/ui/game/game-result-banner";
import { InviteCodeCard } from "@gomoku/ui/game/invite-code-card";
import { PlayerClock } from "@gomoku/ui/game/player-clock";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import type { ReactNode } from "react";

import { cellLabel, MIDGAME, MIDGAME_LAST_MOVE, WIN_LINE, WON_GAME, WON_LAST_MOVE } from "../shared";

// The /games/[id] screen as it looks in each state (game-invitations, game-moves, clock, reconnection).

export type GameState =
  | "loading"
  | "not-found"
  | "waiting-for-opponent"
  | "waiting-for-page-open"
  | "your-turn"
  | "opponent-turn"
  | "low-time"
  | "reconnected"
  | "won"
  | "lost"
  | "lost-on-time"
  | "draw";

const ENDINGS: Partial<Record<GameState, { result: GameResult; title: string; reason: string }>> = {
  won: { result: "win", title: "Wygrałeś", reason: "Pięć kamieni w linii." },
  lost: { result: "loss", title: "Przegrałeś", reason: "Przeciwnik ułożył pięć kamieni w linii." },
  "lost-on-time": { result: "loss", title: "Przegrałeś", reason: "Skończył się Twój czas." },
  draw: { result: "draw", title: "Remis", reason: "Plansza jest pełna." },
};

const noop = () => undefined;

// The app names an agent "Agent", then (when it declared a model name) " · {name}" cut with an ellipsis
// and a fixed "(deklarowane)" (E06-S01, BR-31); the same wrapper here. The name is a text node.
export function AgentName({ declared }: { declared?: string }) {
  const label = declared === undefined ? "Agent" : `Agent · ${declared} (deklarowane)`;
  return (
    <span className="flex min-w-0 max-w-full items-baseline" title={label}>
      <span className="shrink-0 whitespace-pre">Agent</span>
      {declared !== undefined && (
        <>
          <span className="shrink-0 whitespace-pre"> · </span>
          <span className="min-w-0 truncate">{declared}</span>
          <span className="shrink-0 whitespace-pre"> (deklarowane)</span>
        </>
      )}
    </span>
  );
}

type GameScreenProps = {
  state: GameState;
  /** The opponent's name on the clock; an account name by default. */
  opponent?: ReactNode;
  /** Set when the opponent is an agent: no rematch, a hint instead (R7). */
  agentOpponent?: boolean;
};

export function GameScreen({ state, opponent = "Alicja_99", agentOpponent = false }: GameScreenProps) {
  if (state === "loading") {
    return (
      <SkeletonRegion label="Ładowanie partii" className="max-w-(--layout-width-board) gap-stack">
        <Skeleton className="h-target" />
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="h-target" />
      </SkeletonRegion>
    );
  }

  if (state === "not-found") {
    return (
      <ErrorState
        title="Ta partia nie istnieje albo nie masz do niej dostępu"
        action={<TextLink href="#start" placement="standalone">Wróć na stronę główną</TextLink>}
      >
        Sprawdź adres albo poproś znajomego o nowe zaproszenie.
      </ErrorState>
    );
  }

  if (state === "waiting-for-opponent" || state === "waiting-for-page-open") {
    return (
      <div className="flex flex-col gap-stack">
        <TurnStatus>
          {state === "waiting-for-opponent"
            ? "Czekamy na przeciwnika…"
            : `Czekamy, aż ${typeof opponent === "string" ? opponent : "Agent"} otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)`}
        </TurnStatus>
        <InviteCodeCard
          title="Zaproś znajomego"
          link="https://gomoku.example/invite/ABCD-EFGH"
          code="ABCD-EFGH"
          linkLabel="Link do zaproszenia"
          codeLabel="Kod do wpisania na stronie „Mam kod”"
          validUntil="Ważne do 18:40"
          copyLabel="Kopiuj link"
          copiedLabel="Skopiowano"
          onCopy={noop}
          shareLabel="Udostępnij"
          onShare={noop}
          cancelLabel="Anuluj zaproszenie"
          onCancel={noop}
        />
      </div>
    );
  }

  const ending = ENDINGS[state];
  const finished = Boolean(ending);
  const won = state === "won";
  const stones: readonly Stone[] = won || state === "lost" ? WON_GAME : MIDGAME;
  const yourTurn = state === "your-turn" || state === "low-time" || state === "reconnected";
  const lowTime = state === "low-time";

  return (
    <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
      {state === "reconnected" && (
        <Alert status="info" title="Wróciłeś do partii">
          Twój zegar biegł podczas rozłączenia. Pokazujemy aktualny stan.
        </Alert>
      )}
      {ending ? (
        <GameResultBanner result={ending.result} title={ending.title}>
          {ending.reason}
        </GameResultBanner>
      ) : (
        <TurnStatus color="black">{yourTurn ? "Twój ruch (czarne)" : "Ruch przeciwnika"}</TurnStatus>
      )}
      <PlayerClock name={opponent} remainingMs={state === "lost-on-time" ? 301_000 : 412_000} active={!finished && !yourTurn} activeLabel="Ruch przeciwnika" lowLabel="Mało czasu" />
      <Board
        label="Plansza 15 na 15"
        cellLabel={cellLabel}
        stones={stones}
        lastMove={finished && (won || state === "lost") ? WON_LAST_MOVE : MIDGAME_LAST_MOVE}
        winLine={won || state === "lost" ? WIN_LINE : undefined}
        readOnly={finished || !yourTurn}
        onCellSelect={noop}
      />
      <PlayerClock
        name="Ty (Ala_7)"
        remainingMs={lowTime ? 42_000 : state === "lost-on-time" ? 0 : 538_000}
        active={!finished && yourTurn}
        activeLabel="Twój ruch"
        lowLabel="Mało czasu"
      />
      {!finished && yourTurn && <Button>Postaw kamień</Button>}
      {finished && agentOpponent && (
        <Alert status="info" title="Rewanż niedostępny" role="status">
          Aby zagrać z agentem jeszcze raz, utwórz nową partię i przekaż mu nowy kod.
        </Alert>
      )}
      {finished && (
        <EmptyState title="Partia jest zakończona" action={<TextLink href="#historia" placement="standalone">Zobacz historię partii</TextLink>}>
          Wynik zapisał się w historii obu graczy.
        </EmptyState>
      )}
    </div>
  );
}
