// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, push } = vi.hoisted(() => ({ apiCall: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.setConfig({ testTimeout: 20_000 });

import type { GameView } from "@/server/http/game-view";

import { RematchPanel } from "./rematch-panel";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const IN_5_MIN = "2026-10-30T12:05:00.000Z";
type Rematch = NonNullable<GameView["rematch"]>;

const finished = (over: Partial<GameView> = {}): GameView => ({
  status: "finished",
  you: { seat: 1, kind: "account" },
  players: [
    { seat: 1, kind: "account", displayName: "Ala_7", seen: true },
    { seat: 2, kind: "account", displayName: "Kuba_P", seen: true },
  ],
  moveCount: 0,
  blackSeat: 1,
  turnSeat: null,
  moves: [],
  result: { winnerSeat: 1, reason: "five_in_row", winLine: [0, 1, 2, 3, 4] },
  clock: { remainingMs: [600_000, 600_000] as [number, number], running: null, now: NOW },
  ...over,
});
const guestMe = (over: Partial<GameView> = {}) =>
  finished({
    you: { seat: 1, kind: "guest" },
    players: [
      { seat: 1, kind: "guest", displayName: "Gracz 1", seen: true },
      { seat: 2, kind: "guest", displayName: "Zuza", seen: true },
    ],
    ...over,
  });
const offer = (over: Partial<Rematch> = {}): Rematch => ({ state: "pending", offeredBySeat: 1, expiresAt: IN_5_MIN, gameId: null, ...over });
const failure = (code: string, extra: object = {}) => ({ ok: false, error: { code, message: "x", ...extra } });

const onRefresh = vi.fn();
const onGone = vi.fn();
const seen: GameView[] = [];

/** Keeps the state the way the room does: `onState` replaces the game. */
function Harness({ initial, reopened = false }: { initial: GameView; reopened?: boolean }) {
  const [game, setGame] = useState(initial);
  return (
    <RematchPanel
      gameId="g1"
      game={game}
      reopened={reopened}
      onState={(next) => {
        seen.push(next);
        setGame(next);
      }}
      onRefresh={onRefresh}
      onGone={onGone}
    />
  );
}
const panel = (game: GameView, reopened = false) => render(<Harness initial={game} reopened={reopened} />);
const press = (element: HTMLElement) => act(async () => element.click());
const button = (name: string) => screen.getByRole("button", { name });
const link = (name: string) => screen.getByRole("link", { name });
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const status = () => screen.getByTestId("rematch-status").textContent;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  apiCall.mockReset().mockResolvedValue({ ok: true, data: {} });
  push.mockReset();
  onRefresh.mockReset();
  onGone.mockReset();
  seen.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RematchPanel, on the server", () => {
  it("renders the wait without a countdown, because the clock of the server is not the player's", () => {
    const html = renderToStaticMarkup(
      <RematchPanel gameId="g1" game={finished({ rematch: offer() })} reopened={false} onState={vi.fn()} onRefresh={onRefresh} onGone={onGone} />,
    );
    expect(html).toContain("Zaproponowano rewanż");
    expect(html).not.toContain("Pozostało");
  });
});

describe("RematchPanel, no offer yet (p06.10)", () => {
  it("says the colours swap and offers the rematch and the way back", () => {
    panel(finished());
    expect(screen.getByRole("heading", { name: "Rewanż" })).toBeTruthy();
    expect(screen.getByTestId("rematch-info").textContent).toBe("Rewanż to nowa partia z odwróconymi kolorami: zagrasz białymi.");
    expect(button("Rewanż")).toBeTruthy();
    expect(link("Wróć do panelu głównego").getAttribute("href")).toBe("/");
    expect(screen.queryByTestId("guest-rematch-note")).toBeNull();
  });

  it("tells a white player they will play black", () => {
    panel(finished({ blackSeat: 2 }));
    expect(screen.getByTestId("rematch-info").textContent).toContain("zagrasz czarnymi");
  });

  it("tells a guest about the new access (p06.15)", () => {
    panel(guestMe());
    expect(screen.getByTestId("guest-rematch-note").textContent).toBe("Jako gość dostaniesz nowy dostęp do nowej partii w tej przeglądarce.");
  });

  it("offers once (also on a double click), then shows the wait from the answer", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    panel(finished());
    const offerButton = button("Rewanż");
    await act(async () => {
      offerButton.click();
      offerButton.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch");
    expect(button("Wysyłanie…")).toBeTruthy();
    await act(async () => answer({ ok: true, data: offer() }));
    expect(status()).toContain("Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).");
    expect(seen.at(-1)!.rematch).toEqual(offer());
  });

  it("shows nothing for the opponent's offer that was declined", () => {
    panel(finished({ rematch: offer({ state: "declined", offeredBySeat: 2 }) }));
    expect(button("Rewanż")).toBeTruthy();
    expect(screen.queryByText("Zaproszenie do rewanżu odrzucone")).toBeNull();
  });

  it("sends the opponent's offer that came first to the acceptance (both offered at once)", async () => {
    apiCall.mockResolvedValue(failure("REMATCH_ALREADY_OFFERED"));
    panel(finished());
    await press(button("Rewanż"));
    expect(screen.getByText("Przeciwnik zdążył zaproponować rewanż. Odświeżamy stan.")).toBeTruthy();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("reads the state again when the game turns out not to be finished", async () => {
    apiCall.mockResolvedValue(failure("GAME_NOT_FINISHED"));
    panel(finished());
    await press(button("Rewanż"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("says how long to wait after the limit (429), rounded up to minutes and at least one", async () => {
    apiCall.mockResolvedValue(failure("RATE_LIMITED", { retryAfterSeconds: 61 }));
    panel(finished());
    await press(button("Rewanż"));
    expect(screen.getByText("Zbyt wiele propozycji rewanżu. Spróbuj ponownie za 2 min.")).toBeTruthy();
    expect(screen.queryByTestId("rematch-retry")).toBeNull();
    cleanup();
    apiCall.mockResolvedValue(failure("RATE_LIMITED"));
    panel(finished());
    await press(button("Rewanż"));
    expect(screen.getByText("Zbyt wiele propozycji rewanżu. Spróbuj ponownie za 1 min.")).toBeTruthy();
  });

  it("offers a retry after a network error and sends the same call again", async () => {
    apiCall.mockResolvedValueOnce(failure("network"));
    panel(finished());
    await press(button("Rewanż"));
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    apiCall.mockResolvedValue({ ok: true, data: offer() });
    await press(screen.getByTestId("rematch-retry"));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(status()).toContain("Zaproponowano rewanż");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says something went wrong on a server error, with a retry", async () => {
    apiCall.mockResolvedValue(failure("INTERNAL"));
    panel(finished());
    await press(button("Rewanż"));
    expect(screen.getByRole("alert").textContent).toContain("Coś poszło nie tak. Spróbuj ponownie.");
    expect(screen.getByTestId("rematch-retry")).toBeTruthy();
  });

  it("hands a 404 to the room", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    panel(finished());
    await press(button("Rewanż"));
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});

describe("RematchPanel, own offer (p06.11)", () => {
  it("counts down to the end of the offer (the wait is up to 5 min)", async () => {
    panel(finished({ rematch: offer() }));
    expect(screen.getByTestId("rematch-countdown").textContent).toContain("Pozostało 5:00.");
    await tick(61_000);
    expect(screen.getByTestId("rematch-countdown").textContent).toContain("Pozostało 3:59.");
    expect(status()).toContain("Czekamy na odpowiedź przeciwnika (do 5 min).");
  });

  it("turns into the expired state when the time runs out, without a read, and offers again (p06.14)", async () => {
    panel(finished({ rematch: offer() }));
    await tick(5 * 60_000 + 1000);
    expect(status()).toBe("Zaproszenie do rewanżu wygasło (po 5 minutach).");
    apiCall.mockResolvedValue({ ok: true, data: offer({ expiresAt: "2026-10-30T12:10:00.000Z" }) });
    await press(button("Zaproponuj ponownie"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch");
    expect(status()).toContain("Zaproponowano rewanż");
  });

  it.each([6, -6])("counts against the server's time, not the device's clock (device %i min off)", async (skewMin) => {
    // The device clock is off; the server's `clock.now` is the reference (as for the game clock).
    vi.setSystemTime(NOW + skewMin * 60_000);
    panel(finished({ rematch: offer() }));
    expect(screen.getByTestId("rematch-countdown").textContent).toContain("Pozostało 5:00.");
    await tick(61_000);
    expect(screen.getByTestId("rematch-countdown").textContent).toContain("Pozostało 3:59.");
    await tick(4 * 60_000);
    expect(status()).toBe("Zaproszenie do rewanżu wygasło (po 5 minutach).");
  });

  it("shows the opponent's offer for acceptance on a device with a fast clock", () => {
    vi.setSystemTime(NOW + 6 * 60_000);
    panel({ ...finished(), rematch: offer({ offeredBySeat: 2 }) });
    expect(button("Przyjmij")).toBeTruthy();
  });

  it("keeps counting from the answer it has, however long ago the answer came", async () => {
    panel(finished({ rematch: offer() }));
    await tick(30_000);
    // The offer made now is a patch of the same state: the time of the last answer plus the time since.
    expect(screen.getByTestId("rematch-countdown").textContent).toContain("Pozostało 4:30.");
  });

  it("shows the expiry the server reports as well", () => {
    panel(finished({ rematch: offer({ state: "expired" }) }));
    expect(status()).toBe("Zaproszenie do rewanżu wygasło (po 5 minutach).");
    expect(link("Wróć do panelu głównego")).toBeTruthy();
  });

  it("withdraws the offer with a decline and reads it as none, not as a refusal", async () => {
    panel(finished({ rematch: offer() }));
    await press(button("Wycofaj propozycję"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch/decline");
    expect(seen.at(-1)!.rematch!.state).toBe("declined");
    expect(button("Rewanż")).toBeTruthy();
    expect(screen.queryByText("Zaproszenie do rewanżu odrzucone")).toBeNull();
  });

  it("shows 'Wycofywanie…' while the decline is on its way", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    panel(finished({ rematch: offer() }));
    await press(button("Wycofaj propozycję"));
    expect(button("Wycofywanie…")).toBeTruthy();
    await act(async () => answer({ ok: true, data: {} }));
  });

  it("reads the state when the offer is no longer there to withdraw (it expired or was answered)", async () => {
    apiCall.mockResolvedValue(failure("REMATCH_EXPIRED"));
    panel(finished({ rematch: offer() }));
    await press(button("Wycofaj propozycję"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    apiCall.mockResolvedValue(failure("REMATCH_NOT_OFFERED"));
    await press(button("Wycofaj propozycję"));
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("keeps the wait and offers a retry when the withdrawal fails", async () => {
    apiCall.mockResolvedValueOnce(failure("network"));
    panel(finished({ rematch: offer() }));
    await press(button("Wycofaj propozycję"));
    expect(screen.getByRole("alert")).toBeTruthy();
    await press(screen.getByTestId("rematch-retry"));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(button("Rewanż")).toBeTruthy();
  });

  it("shows a refusal of the opponent to the proposer, who can offer again (p06.13)", async () => {
    panel(finished({ rematch: offer({ state: "declined" }) }));
    expect(screen.getByRole("status").textContent).toContain("Zaproszenie do rewanżu odrzucone");
    apiCall.mockResolvedValue({ ok: true, data: offer() });
    await press(button("Zaproponuj ponownie"));
    expect(status()).toContain("Zaproponowano rewanż");
    expect(screen.queryByText("Zaproszenie do rewanżu odrzucone")).toBeNull();
  });
});

describe("RematchPanel, the opponent's offer (p06.12)", () => {
  const theirs = (game = finished()) => ({ ...game, rematch: offer({ offeredBySeat: 2 }) });

  it("names the opponent, a guest with the suffix, and counts down", () => {
    panel(theirs(guestMe()));
    expect(status()).toContain("Zuza (gość) proponuje rewanż. Kolory zostaną zamienione.");
    expect(screen.getByTestId("rematch-countdown")).toBeTruthy();
    expect(screen.getByTestId("guest-rematch-note")).toBeTruthy();
  });

  it("accepts and goes to the new game; the colours of the new game are its own business", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g2" } });
    panel(theirs());
    await press(button("Przyjmij"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch/accept");
    expect(push).toHaveBeenCalledWith("/games/g2");
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rematch-status").textContent).toBe("Rewanż przyjęty. Przechodzimy do nowej partii…");
    expect(seen.at(-1)!.rematch).toMatchObject({ state: "accepted", gameId: "g2" });
  });

  it("shows 'Przyjmowanie…' and locks the decline while accepting", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(button("Przyjmowanie…")).toBeTruthy();
    expect((button("Odrzuć") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer({ ok: true, data: { gameId: "g2" } }));
  });

  it("declines, says so and offers its own rematch", async () => {
    panel(theirs());
    await press(button("Odrzuć"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch/decline");
    expect(status()).toBe("Odrzuciłeś propozycję rewanżu.");
    expect(button("Rewanż")).toBeTruthy();
  });

  it("locks the accept while declining", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    panel(theirs());
    await press(button("Odrzuć"));
    expect((button("Przyjmij") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer({ ok: true, data: {} }));
  });

  it("forgets 'Odrzuciłeś' when the viewer offers a rematch himself", async () => {
    panel(theirs());
    await press(button("Odrzuć"));
    apiCall.mockResolvedValue({ ok: true, data: offer() });
    await press(button("Rewanż"));
    await press(button("Wycofaj propozycję"));
    expect(screen.queryByText("Odrzuciłeś propozycję rewanżu.")).toBeNull();
  });

  it("links to the viewer's own game on 409 ACTIVE_GAME_EXISTS and keeps the offer", async () => {
    apiCall.mockResolvedValue(failure("ACTIVE_GAME_EXISTS", { data: { gameId: "g9" } }));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(screen.getByText("Masz już partię w toku. Dokończ ją, a potem przyjmij rewanż.")).toBeTruthy();
    expect(link("Przejdź do swojej partii").getAttribute("href")).toBe("/games/g9");
    expect(button("Przyjmij")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("gives no link when the other game is the opponent's", async () => {
    apiCall.mockResolvedValue(failure("ACTIVE_GAME_EXISTS"));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(screen.getByText("Przeciwnik ma już inną partię w toku. Propozycja trwa do wygaśnięcia lub odrzucenia.")).toBeTruthy();
    expect(screen.queryByTestId("rematch-own-game")).toBeNull();
  });

  it("ignores a game id that is not a text", async () => {
    apiCall.mockResolvedValue(failure("ACTIVE_GAME_EXISTS", { data: { gameId: 5 } }));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(screen.queryByTestId("rematch-own-game")).toBeNull();
  });

  it("takes the accept away, without a retry, when the opponent is no longer available", async () => {
    apiCall.mockResolvedValue(failure("REMATCH_UNAVAILABLE"));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(screen.getByText("Rewanż jest niemożliwy: przeciwnik nie jest już dostępny.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Przyjmij" })).toBeNull();
    expect(screen.queryByTestId("rematch-retry")).toBeNull();
    expect(button("Odrzuć")).toBeTruthy();
  });

  it("reads the state when the offer expired or was withdrawn meanwhile", async () => {
    apiCall.mockResolvedValue(failure("REMATCH_EXPIRED"));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(screen.getByText("Propozycja rewanżu wygasła.")).toBeTruthy();
    apiCall.mockResolvedValue(failure("REMATCH_NOT_OFFERED"));
    await press(button("Przyjmij"));
    expect(screen.getByText("Przeciwnik wycofał propozycję rewanżu.")).toBeTruthy();
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("retries a network error of the acceptance", async () => {
    apiCall.mockResolvedValueOnce(failure("network"));
    panel(theirs());
    await press(button("Przyjmij"));
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g2" } });
    await press(screen.getByTestId("rematch-retry"));
    expect(push).toHaveBeenCalledWith("/games/g2");
  });

  it("hands a 404 of the acceptance to the room", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    panel(theirs());
    await press(button("Przyjmij"));
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("retries a failed refusal", async () => {
    apiCall.mockResolvedValueOnce(failure("INTERNAL"));
    panel(theirs());
    await press(button("Odrzuć"));
    await press(screen.getByTestId("rematch-retry"));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(status()).toBe("Odrzuciłeś propozycję rewanżu.");
  });

  it("reads the state when the refusal finds no open offer", async () => {
    apiCall.mockResolvedValue(failure("REMATCH_NOT_OFFERED"));
    panel(theirs());
    await press(button("Odrzuć"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("RematchPanel, accepted: the way to the new game", () => {
  const accepted = (game: GameView) => ({ ...game, rematch: offer({ state: "accepted", gameId: "g2" }) });

  it("goes straight to the new game for an account, without a read of this game", async () => {
    panel(accepted(finished()));
    await tick(0);
    expect(push).toHaveBeenCalledWith("/games/g2");
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("goes straight on for a guest who learned it from a poll (that read was the claim)", async () => {
    panel(accepted(guestMe()));
    await tick(0);
    expect(push).toHaveBeenCalledWith("/games/g2");
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("reads this game BEFORE it moves a guest who reloaded on an accepted rematch (the token of the new game)", async () => {
    const order: string[] = [];
    apiCall.mockImplementation(async (path: string) => {
      order.push(`GET ${path}`);
      return { ok: true, data: {} };
    });
    push.mockImplementation((path: string) => order.push(`push ${path}`));
    panel(accepted(guestMe()), true);
    await tick(0);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1", { method: "GET" });
    expect(order).toEqual(["GET /api/games/g1", "push /games/g2"]);
  });

  it("reads once and does not loop: a failed read shows an error and waits for the player", async () => {
    apiCall.mockResolvedValue(failure("network"));
    panel(accepted(guestMe()), true);
    await tick(10_000);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Nie udało się przejść do nowej partii.")).toBeTruthy();
    apiCall.mockResolvedValue({ ok: true, data: {} });
    await press(screen.getByTestId("rematch-claim-retry"));
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/games/g2");
    expect(screen.queryByText("Nie udało się przejść do nowej partii.")).toBeNull();
  });

  it("hands a 404 of the read to the room", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    panel(accepted(guestMe()), true);
    await tick(0);
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not move on after the page was left in the middle of the read", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const view = panel(accepted(guestMe()), true);
    await tick(0);
    view.unmount();
    await act(async () => answer({ ok: true, data: {} }));
    expect(push).not.toHaveBeenCalled();
    cleanup();
    apiCall.mockReset();
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const second = panel(accepted(guestMe()), true);
    await tick(0);
    second.unmount();
    await act(async () => answer(failure("NOT_FOUND")));
    expect(onGone).not.toHaveBeenCalled();
  });
});

describe("RematchPanel, leaving for the panel (L21)", () => {
  it("declines an open offer, the proposer's own as well, and then goes to the main page", async () => {
    panel(finished({ rematch: offer() }));
    await press(link("Wróć do panelu głównego"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch/decline");
    expect(push).toHaveBeenCalledWith("/");
    cleanup();
    apiCall.mockClear();
    panel(finished({ rematch: offer({ offeredBySeat: 2 }) }));
    await press(link("Wróć do panelu głównego"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/rematch/decline");
  });

  it("goes on even when the decline fails, and sends it once on a double click", async () => {
    apiCall.mockResolvedValue(failure("network"));
    panel(finished({ rematch: offer() }));
    const leave = link("Wróć do panelu głównego");
    await act(async () => {
      leave.click();
      leave.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("is a plain link when there is no open offer: nothing is sent", async () => {
    panel(finished());
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => void link("Wróć do panelu głównego").dispatchEvent(click));
    expect(click.defaultPrevented).toBe(false);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("does not leave twice while another call is in flight", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    panel(finished({ rematch: offer({ offeredBySeat: 2 }) }));
    await press(button("Odrzuć"));
    await press(link("Wróć do panelu głównego"));
    expect(push).not.toHaveBeenCalled();
    await act(async () => answer({ ok: true, data: {} }));
  });
});
