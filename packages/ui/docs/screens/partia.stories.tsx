import { Alert } from "@gomoku/ui/game/alert";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import { AgentName, GameScreen, type GameState } from "./game-screen";
import { InviteLanding, JoinPage, type InviteState } from "./invite-screens";
import { Screen, screenParameters, type Viewer } from "./screen";

const meta = {
  title: "Ekrany/Partia",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const invite = (state: InviteState, viewer: Viewer): Story => ({ render: () => <InviteLanding state={state} viewer={viewer} /> });

export const ZaproszenieNiezalogowany: Story = invite("visitor", "none");
export const ZaproszenieZalogowanyPotwierdzony: Story = invite("player-confirmed", "player");
export const ZaproszenieOstrzezenieDlaGoscia: Story = invite("guest-warning", "guest");
export const ZaproszenieMaInnaPartie: Story = invite("has-other-game", "player");
export const ZaproszenieMaOczekujacaPartie: Story = invite("has-waiting-game", "player");
export const ZaproszenieLimitProb: Story = invite("limited", "none");
export const ZaproszenieNiewazne: Story = invite("invalid", "none");

export const KodPusty: Story = { render: () => <JoinPage /> };
export const KodZaKrotki: Story = { render: () => <JoinPage error="Sprawdź kod: ma 8 znaków." /> };

const game = (
  state: GameState,
  viewer: Viewer = "player",
  opponent?: { name: ReactNode; agent?: boolean },
): Story => ({
  render: () => (
    <Screen viewer={viewer}>
      {viewer === "guest" && (
        <Alert status="warning" title="Grasz bez konta">Nie zmieniaj przeglądarki w trakcie partii.</Alert>
      )}
      <GameScreen state={state} opponent={opponent?.name} agentOpponent={opponent?.agent} />
    </Screen>
  ),
});

export const PartiaLadowanie: Story = game("loading");
export const PartiaNieIstniejeAlboBrakDostepu: Story = game("not-found");
export const PartiaTworcaCzekaNaPrzeciwnika: Story = game("waiting-for-opponent");
export const PartiaCzekamyAzPrzeciwnikOtworzyStrone: Story = game("waiting-for-page-open");
export const PartiaTwojRuch: Story = {
  ...game("your-turn"),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Twój ruch (czarne)");
  },
};
export const PartiaRuchPrzeciwnika: Story = game("opponent-turn");
export const PartiaMaloCzasu: Story = game("low-time");
export const PartiaPowrotPoRozlaczeniu: Story = game("reconnected");
export const PartiaWygrana: Story = game("won");
export const PartiaPrzegrana: Story = game("lost");
export const PartiaPrzegranaNaCzas: Story = game("lost-on-time");
export const PartiaRemis: Story = game("draw");
export const PartiaGoscWTrakcie: Story = game("your-turn", "guest");

// Przeciwnik "Agent" (E06-S01, BR-31): dołączył przez MCP; nazwa modelu jest deklarowana i niezweryfikowana.
const LONG_MODEL = "qwen2.5-coder-32b-instruct/preview (v2)";
export const PartiaPrzeciwnikAgent: Story = {
  ...game("opponent-turn", "player", { name: <AgentName /> }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Agent")).toBeVisible();
  },
};
export const PartiaPrzeciwnikAgentZNazwaModelu: Story = {
  ...game("opponent-turn", "player", { name: <AgentName declared="claude opus 5.5" /> }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("claude opus 5.5")).toBeVisible();
    await expect(canvas.getByText("(deklarowane)")).toBeVisible();
  },
};
export const PartiaPrzeciwnikAgentDlugaNazwaModelu: Story = {
  ...game("opponent-turn", "player", { name: <AgentName declared={LONG_MODEL} /> }),
  parameters: { ...screenParameters, viewport: { defaultViewport: "phone" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("(deklarowane)")).toBeVisible();
  },
};
export const PartiaAgentCzekamyAzOtworzyStrone: Story = game("waiting-for-page-open", "player", { name: <AgentName /> });
export const PartiaKoniecZAgentem: Story = {
  ...game("won", "player", { name: <AgentName declared="claude opus 5.5" />, agent: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Rewanż niedostępny")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Rewanż" })).toBeNull();
  },
};
