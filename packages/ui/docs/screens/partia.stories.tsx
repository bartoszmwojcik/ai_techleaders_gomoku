import { Alert } from "@gomoku/ui/game/alert";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import type { ChatPreviewState } from "./chat-preview";
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

// Czat w partii (E07-S01): panel pod planszą i, po wyniku, pod blokiem rewanżu.
const chatScreen = (state: GameState, chat: ChatPreviewState, opponent?: { name: ReactNode }): Story => ({
  render: () => (
    <Screen viewer="player">
      <GameScreen state={state} chat={chat} opponent={opponent?.name} />
    </Screen>
  ),
});
const phone = { ...screenParameters, viewport: { defaultViewport: "phone" } };

export const PartiaCzatPusty: Story = {
  ...chatScreen("your-turn", "empty"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Nikt jeszcze nic nie napisał. Napisz pierwszy.")).toBeVisible();
    await expect(canvas.getByLabelText("Wiadomość")).toBeVisible();
  },
};
export const PartiaCzatRozmowa: Story = {
  ...chatScreen("opponent-turn", "conversation"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("log", { name: "Wiadomości czatu" })).toBeVisible();
    await expect(canvas.getByText("Cześć! Gramy?")).toBeVisible();
  },
};
export const PartiaCzatWylaczonyPrzezRozmowce: Story = {
  ...chatScreen("your-turn", "disabled-by-opponent"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Wiadomość")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Wyłącz czat" })).toBeEnabled();
  },
};
export const PartiaCzatWylaczonyPrzezCiebie: Story = {
  ...chatScreen("your-turn", "disabled-by-you"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Włącz czat" })).toBeVisible();
    await expect(canvas.getByText(/^Wyłączyłeś czat\./)).toBeVisible();
    await expect(canvas.queryByLabelText("Wiadomość")).toBeNull();
  },
};
export const PartiaCzatBladPrzelaczenia: Story = {
  ...chatScreen("your-turn", "switch-error"),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Nie udało się wyłączyć czatu. Spróbuj ponownie.")).toBeVisible();
  },
};
export const PartiaCzatBladWysylki: Story = {
  ...chatScreen("your-turn", "send-error"),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Ponów wysyłanie" })).toBeVisible();
  },
};
export const PartiaCzatPrzedDolaczeniemPrzeciwnika: Story = chatScreen("waiting-for-opponent", "waiting");
export const PartiaWynikZCzatem: Story = chatScreen("won", "conversation");
export const PartiaCzatZamkniety: Story = chatScreen("won", "closed");
export const PartiaCzatWylaczonyPrzezCiebie320: Story = {
  ...chatScreen("your-turn", "disabled-by-you"),
  parameters: phone,
};
export const PartiaCzat320: Story = {
  ...chatScreen("opponent-turn", "conversation", { name: <AgentName declared={LONG_MODEL} /> }),
  parameters: phone,
};
