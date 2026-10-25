import { Alert } from "@gomoku/ui/game/alert";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { GameScreen, type GameState } from "./game-screen";
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
export const ZaproszenieZalogowanyBezPotwierdzenia: Story = invite("player-unconfirmed", "player");
export const ZaproszenieOstrzezenieDlaGoscia: Story = invite("guest-warning", "guest");
export const ZaproszenieMaInnaPartie: Story = invite("has-other-game", "player");
export const ZaproszenieMaOczekujacaPartie: Story = invite("has-waiting-game", "player");
export const ZaproszenieLimitProb: Story = invite("limited", "none");
export const ZaproszenieNiewazne: Story = invite("invalid", "none");

export const KodPusty: Story = { render: () => <JoinPage /> };
export const KodZaKrotki: Story = { render: () => <JoinPage error="Sprawdź kod: ma 8 znaków." /> };

const game = (state: GameState, viewer: Viewer = "player"): Story => ({
  render: () => (
    <Screen viewer={viewer}>
      {viewer === "guest" && (
        <Alert status="warning" title="Grasz bez konta">Nie zmieniaj przeglądarki w trakcie partii.</Alert>
      )}
      <GameScreen state={state} />
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
