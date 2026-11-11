// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import frHeader from "@/i18n/catalogs/fr/header";
import frShow from "@/i18n/catalogs/fr/show";
import { PROJECTOR_STORAGE_KEY } from "@/lib/show/texts";
import type { ShowView } from "@/server/http/show-view";

import { ShowRoom } from "./show-room";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

const live = (over: Partial<ShowView> = {}): ShowView => ({
  status: "active",
  variant: "classic",
  timeControlMs: 600_000,
  moveCount: 1,
  blackSeat: 2,
  turnSeat: 1,
  moves: [112],
  result: null,
  clock: { remainingMs: [600_000, 590_000], running: 1, now: 5_000_000 },
  layout: "bot-bot",
  drive: { botOnTurn: false, stalled: false },
  players: [
    { seat: 1, kind: "bot", displayName: "Bot · poziom 1", bot: { level: 1, memoryMb: null, tableMb: null } },
    { seat: 2, kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768, tableMb: 16 } },
  ],
  ...over,
});
const finished = (over: Partial<ShowView> = {}) =>
  live({
    status: "finished",
    turnSeat: null,
    moves: [],
    result: { winnerSeat: 2, reason: "timeout", winLine: null },
    clock: { remainingMs: [0, 590_000], running: null, now: 5_100_000 },
    finishedAt: "2026-11-10T12:00:00.000Z",
    ...over,
  });

let replaceState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  apiCall.mockReset();
  window.localStorage.clear();
  window.history.replaceState(null, "", `/show/${GAME}`);
  replaceState = vi.spyOn(window.history, "replaceState");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const room = (initial = live(), projector: boolean | null = null, extra: object = {}) =>
  render(<ShowRoom gameId={GAME} initial={initial} projector={projector} {...extra} />);

describe("ShowRoom, the read-only view", () => {
  it("shows the board, both clocks by colour with the bots' names, whose turn it is and that the drive runs", () => {
    room();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pokaz: Bot vs bot");
    expect(screen.getByRole("grid", { name: "Plansza 15 na 15" })).toBeTruthy();
    expect(screen.getByLabelText("Kolumna H, rząd 8, czarny kamień")).toBeTruthy();
    const clocks = screen.getAllByRole("timer").map((timer) => timer.closest("[data-slot=clock]")!.textContent);
    // Black (seat 2) first.
    expect(clocks[0]).toContain("Czarne: Bot · poziom 2 · 16 MB");
    expect(clocks[1]).toContain("Białe: Bot · poziom 1");
    expect(screen.getByText("Ruch białych: Bot · poziom 1")).toBeTruthy();
    expect(screen.getByTestId("show-drive").textContent).toBe("Napęd działa");
    expect(screen.getByRole("button", { name: "Zakończ pokaz" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wyloguj" })).toBeNull();
  });

  it("speaks the language the server passed (bot names from their strength)", () => {
    room(live(), null, { locale: "fr", dict: frShow, headerDict: frHeader });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Démonstration : Bot contre bot");
    expect(screen.getByText("Trait aux blancs : Bot · niveau 1")).toBeTruthy();
    expect(screen.getAllByRole("timer")[0]!.closest("[data-slot=clock]")!.textContent).toContain("Noirs : Bot · niveau 2 · 16 Mo");
  });

  it("gives the result in neutral words, the way to a new show and logging out after the end", () => {
    room(finished());

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Koniec pokazu");
    expect(screen.getByText("Wygrały czarne: Bot · poziom 2 · 16 MB")).toBeTruthy();
    expect(screen.getByText("Drugiej stronie skończył się czas.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nowy pokaz" }).getAttribute("href")).toBe("/show");
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zakończ pokaz" })).toBeNull();
    expect(screen.queryByTestId("show-drive")).toBeNull();
  });

  it("says a draw, and how a cancelled show ended", () => {
    room(finished({ result: { winnerSeat: null, reason: "draw", winLine: null } }));
    expect(screen.getByText("Remis")).toBeTruthy();
    cleanup();
    room(live({ status: "cancelled", turnSeat: null, closedReason: "ended" }));
    expect(screen.getByText("Pokaz zakończony przez administratora")).toBeTruthy();
    cleanup();
    room(live({ status: "cancelled", turnSeat: null, blackSeat: null, closedReason: "expired", layout: "bot-agent", players: [live().players[0]!] }));
    expect(screen.getByText("Pokaz wygasł (agent nie dołączył)")).toBeTruthy();
    expect(screen.getAllByRole("timer")[0]!.closest("[data-slot=clock]")!.textContent).toContain("Bot · poziom 1");
  });

  it("names a seat without a known side by its name only", () => {
    room(live({ status: "waiting", blackSeat: null, turnSeat: null, layout: "bot-agent", players: [live().players[0]!] }));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pokaz: Bot vs agent");
    expect(screen.queryByText(/Ruch /)).toBeNull();
  });
});

const GET = { method: "GET", signal: expect.any(AbortSignal) };

describe("ShowRoom, the drive (phase b)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("keeps reading the moves after the known ones and merges them, faster while a bot is on turn", async () => {
    apiCall
      .mockResolvedValueOnce({ ok: true, data: live({ moveCount: 2, turnSeat: 2, moves: [113], drive: { botOnTurn: true, stalled: false } }) })
      .mockResolvedValue({ ok: true, data: live({ moveCount: 2, turnSeat: 2, moves: [], drive: { botOnTurn: true, stalled: false } }) });
    room();

    await advance(1_999);
    expect(apiCall).not.toHaveBeenCalled();
    await advance(1);
    expect(apiCall).toHaveBeenCalledWith(`/api/show/${GAME}?after=1`, GET);
    expect(screen.getByLabelText("Kolumna I, rząd 8, biały kamień")).toBeTruthy();
    expect(screen.getByLabelText("Kolumna H, rząd 8, czarny kamień")).toBeTruthy();
    // A bot is on turn now: the next read follows in 750 ms, after the known two moves.
    await advance(750);
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(apiCall).toHaveBeenLastCalledWith(`/api/show/${GAME}?after=2`, GET);
  });

  it("says the drive stopped after 3 failed reads, with the reason, the clock and Sprawdź teraz, and runs again on a success", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "network", message: "x" } });
    room();

    await advance(2_000);
    expect(screen.getByTestId("show-drive").dataset.state).toBe("slowed");
    expect(within(screen.getByTestId("show-drive")).getByRole("status").textContent).toContain("Napęd zwalnia");
    await advance(4_000);
    const alert = screen.getByTestId("show-drive");
    expect(alert.textContent).toContain("Napęd zatrzymany: Brak odpowiedzi serwera od 6 sekund");
    expect(alert.textContent).toContain("jeszcze 9:54");
    // The live region says the stop once, without the ticking seconds, so a screen reader does not re-read it every tick.
    expect(screen.getByRole("alert").textContent).toBe("Napęd zatrzymany: Brak odpowiedzi serwera");
    await advance(1_000);
    expect(alert.textContent).toContain("od 7 sekund");
    expect(screen.getByRole("alert").textContent).toBe("Napęd zatrzymany: Brak odpowiedzi serwera");

    apiCall.mockResolvedValue({ ok: true, data: live({ moves: [] }) });
    await act(async () => screen.getByRole("button", { name: "Sprawdź teraz" }).click());
    expect(screen.getByTestId("show-drive").textContent).toBe("Napęd działa");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the bot does not answer when the server says so", () => {
    room(live({ drive: { botOnTurn: true, stalled: true } }));
    expect(screen.getByRole("alert").textContent).toBe("Napęd zatrzymany: Bot nie odpowiada");
    expect(screen.getByTestId("show-drive").textContent).toContain("Sprawdź teraz");
  });

  it("shows the indicator in French", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "network", message: "x" } });
    room(live(), null, { locale: "fr", dict: frShow, headerDict: frHeader });
    expect(screen.getByTestId("show-drive").textContent).toBe("Moteur actif");

    await advance(6_000);
    expect(screen.getByRole("alert").textContent).toBe("Moteur arrêté : Aucune réponse du serveur");
    const alert = screen.getByTestId("show-drive");
    expect(alert.textContent).toContain("Moteur arrêté : Aucune réponse du serveur depuis 6 secondes");
    expect(alert.textContent).toContain("encore 9:54");
    expect(screen.getByRole("button", { name: "Vérifier maintenant" })).toBeTruthy();
  });

  it("stops reading once the show is over, and says nothing about the drive", async () => {
    apiCall.mockResolvedValue({ ok: true, data: finished() });
    room();
    await advance(2_000);
    expect(screen.getByText("Koniec pokazu")).toBeTruthy();
    await advance(10_000);
    expect(apiCall).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("show-drive")).toBeNull();
  });

  it("says the show is gone on a 404, with the way back to the console, and stops reading", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "x" } });
    room();

    await advance(2_000);

    expect(screen.getByText("Pokazu już nie ma")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć do konsoli pokazu" }).getAttribute("href")).toBe("/show");
    await advance(10_000);
    expect(apiCall).toHaveBeenCalledOnce();
  });

  it("asks the server when the running clock reaches zero", async () => {
    apiCall.mockResolvedValue({ ok: true, data: finished() });
    room(live({ clock: { remainingMs: [1_000, 590_000], running: 1, now: 5_000_000 } }));

    await advance(1_500);

    expect(apiCall).toHaveBeenCalledWith(`/api/show/${GAME}?after=1`, GET);
    expect(screen.getByText("Koniec pokazu")).toBeTruthy();
  });
});

describe("ShowRoom, Zakończ pokaz", () => {
  it("ends the show after confirmation and shows how it ended", async () => {
    apiCall.mockResolvedValue({ ok: true, data: live({ status: "cancelled", turnSeat: null, closedReason: "ended" }) });
    room();

    await userEvent.click(screen.getByRole("button", { name: "Zakończ pokaz" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Partia zostanie przerwana bez wyniku.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Zakończ pokaz" }));

    expect(apiCall).toHaveBeenCalledWith(`/api/show/${GAME}/end`);
    expect(screen.getByText("Pokaz zakończony przez administratora")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nowy pokaz" })).toBeTruthy();
  });

  it("reads the show again when it had finished in the meantime (409)", async () => {
    apiCall
      .mockResolvedValueOnce({ ok: false, error: { code: "GAME_NOT_ACTIVE", message: "x" } })
      .mockResolvedValueOnce({ ok: true, data: finished() });
    room();

    await userEvent.click(screen.getByRole("button", { name: "Zakończ pokaz" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Zakończ pokaz" }));

    expect(apiCall).toHaveBeenLastCalledWith(`/api/show/${GAME}?after=1`, GET);
    expect(screen.getByText("Koniec pokazu")).toBeTruthy();
  });
});

describe("ShowRoom, Widok pod projektor (P20)", () => {
  const box = () => screen.getByRole("checkbox", { name: "Widok pod projektor" });
  const stage = () => screen.getByTestId("show-stage");

  it("(i) is the normal view without the parameter and with empty storage, and leaves the address alone", () => {
    room();

    expect(box().getAttribute("aria-checked")).toBe("false");
    expect(stage().className).toContain("max-w-(--layout-width-board)");
    expect(stage().hasAttribute("data-projector")).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("(ii) ?projektor=1 gives the projector board and bigger names and clocks", () => {
    room(live(), true);

    expect(box().getAttribute("aria-checked")).toBe("true");
    expect(stage().getAttribute("data-projector")).toBe("true");
    expect(screen.getByRole("grid").className).toContain("max-w-(--layout-width-board-show)");
    const clock = screen.getAllByRole("timer")[0]!.closest("[data-slot=clock]")!;
    expect(clock.className).toContain("[&_time]:text-title");
    expect(clock.querySelector(".text-lead")).not.toBeNull();
  });

  it("(iii) takes the stored choice as the default without the parameter and writes it to the address", () => {
    window.localStorage.setItem(PROJECTOR_STORAGE_KEY, "1");
    room(live(), null);

    expect(box().getAttribute("aria-checked")).toBe("true");
    expect(String(replaceState.mock.calls.at(-1)![2])).toContain("projektor=1");
  });

  it("renders the normal view on the server without the parameter (storage is read in the browser only)", () => {
    window.localStorage.setItem(PROJECTOR_STORAGE_KEY, "1");
    const html = renderToStaticMarkup(<ShowRoom gameId={GAME} initial={live()} projector={null} />);

    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain("data-projector");
  });

  it("(iv) ?projektor=0 switches it off whatever storage says", () => {
    window.localStorage.setItem(PROJECTOR_STORAGE_KEY, "1");
    room(live(), false);

    expect(box().getAttribute("aria-checked")).toBe("false");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("(v) works from the keyboard, announces the change and keeps the choice in the address and storage", async () => {
    room();
    box().focus();

    await userEvent.keyboard(" ");

    expect(box().getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(box());
    expect(screen.getByTestId("show-announcement").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByTestId("show-announcement").textContent).toBe("Włączono widok pod projektor");
    expect(String(replaceState.mock.calls.at(-1)![2])).toContain("projektor=1");
    expect(window.localStorage.getItem(PROJECTOR_STORAGE_KEY)).toBe("1");
    // The switch stays in the projector view.
    await userEvent.keyboard(" ");
    expect(box().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("show-announcement").textContent).toBe("Wyłączono widok pod projektor");
    expect(String(replaceState.mock.calls.at(-1)![2])).toContain("projektor=0");
  });
});

describe("ShowRoom, a bot vs agent show waiting for its agent (phase c)", () => {
  const EXPIRES = "2026-11-10T12:30:00.000Z";
  const SERVER_NOW = Date.parse(EXPIRES) - 30 * 60 * 1000;
  const waiting = (over: Partial<ShowView> = {}): ShowView =>
    live({
      status: "waiting",
      layout: "bot-agent",
      blackSeat: null,
      turnSeat: null,
      moveCount: 0,
      moves: [],
      clock: { remainingMs: [600_000, 600_000], running: null, now: SERVER_NOW },
      players: [{ seat: 1, kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768, tableMb: 16 } }],
      invitation: { code: "ABCD-EFGH", url: "http://localhost:3000/invite/ABCD-EFGH", mcpUrl: "http://localhost:3000/api/mcp", expiresAt: EXPIRES },
      ...over,
    });
  const card = () => screen.getByTestId("show-agent-card");

  it("shows the code masked, the MCP address and the time left; the code never reaches the markup hidden", () => {
    room(waiting());

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pokaz: Bot vs agent");
    expect(within(card()).getByRole("heading", { name: "Wklej kod do swojego agenta" })).toBeTruthy();
    expect(screen.getByTestId("show-agent-code").textContent).toBe("••••-••••");
    expect(screen.getByTestId("show-agent-code").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("show-agent-code-hidden").textContent).toBe("Kod ukryty");
    expect(screen.getByTestId("show-agent-mcp").textContent).toBe("http://localhost:3000/api/mcp");
    expect(screen.getByTestId("show-agent-waiting").textContent).toBe("Czeka na agenta (jeszcze 30:00)");
    expect(card().textContent).not.toContain("ABCD-EFGH");
    expect(renderToStaticMarkup(<ShowRoom gameId={GAME} initial={waiting()} projector={null} />)).toContain("••••-••••");
  });

  it("shows and hides the code with Pokaż, a toggle button", async () => {
    room(waiting());
    const reveal = screen.getByTestId("show-agent-reveal");

    await userEvent.click(reveal);
    expect(screen.getByTestId("show-agent-code").textContent).toBe("ABCD-EFGH");
    expect(screen.getByTestId("show-agent-code").hasAttribute("aria-hidden")).toBe(false);
    expect(screen.queryByTestId("show-agent-code-hidden")).toBeNull();
    expect(reveal.getAttribute("aria-pressed")).toBe("true");
    expect(reveal.textContent).toBe("Ukryj");

    await userEvent.click(reveal);
    expect(screen.getByTestId("show-agent-code").textContent).toBe("••••-••••");
    expect(reveal.textContent).toBe("Pokaż");
  });

  it("copies the code without showing it, and says when copying failed", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    room(waiting());

    await userEvent.click(screen.getByRole("button", { name: "Kopiuj" }));
    expect(writeText).toHaveBeenCalledWith("ABCD-EFGH");
    expect(screen.getByTestId("show-agent-copy-status").textContent).toBe("Skopiowano kod");
    expect(screen.getByTestId("show-agent-code").textContent).toBe("••••-••••");

    await userEvent.click(screen.getByRole("button", { name: "Kopiuj" }));
    expect(screen.getByTestId("show-agent-copy-status").textContent).toBe("Nie udało się skopiować. Pokaż kod i przepisz go.");
  });

  it("speaks French", () => {
    room(waiting(), null, { locale: "fr", dict: frShow });

    expect(within(card()).getByRole("heading", { name: "Collez le code dans votre agent" })).toBeTruthy();
    expect(screen.getByTestId("show-agent-waiting").textContent).toBe("En attente de l’agent (encore 30:00)");
    expect(screen.getByRole("button", { name: "Afficher" })).toBeTruthy();
  });

  describe("with the clock", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

    it("counts down by the server's time and asks the server once the code expired, which tells it apart from an end", async () => {
      apiCall.mockResolvedValue({
        ok: true,
        data: live({ status: "cancelled", layout: "bot-agent", turnSeat: null, blackSeat: null, moves: [], moveCount: 0, closedReason: "expired" }),
      });
      room(waiting({ invitation: { ...waiting().invitation!, expiresAt: new Date(SERVER_NOW + 1_500).toISOString() } }));

      expect(screen.getByTestId("show-agent-waiting").textContent).toBe("Czeka na agenta (jeszcze 0:02)");
      await advance(1_000);
      expect(screen.getByTestId("show-agent-waiting").textContent).toBe("Czeka na agenta (jeszcze 0:01)");
      expect(apiCall).not.toHaveBeenCalled();
      await advance(1_000);
      // Before the drive's own next read (2 s): the countdown asked.
      expect(apiCall).toHaveBeenCalledWith(`/api/show/${GAME}?after=0`, GET);
      expect(screen.getByText("Pokaz wygasł (agent nie dołączył)")).toBeTruthy();
      expect(screen.queryByTestId("show-agent-card")).toBeNull();
    });

    it("drops the card once the agent joined: the server sends no code any more", async () => {
      apiCall.mockResolvedValue({
        ok: true,
        data: live({
          layout: "bot-agent",
          moveCount: 0,
          moves: [],
          turnSeat: 2,
          players: [waiting().players[0]!, { seat: 2, kind: "agent", displayName: null, agentName: "claude" }],
        }),
      });
      room(waiting());

      await advance(2_000);
      expect(screen.queryByTestId("show-agent-card")).toBeNull();
      expect(screen.getByText("Ruch czarnych: Agent · claude (deklarowane)")).toBeTruthy();
    });
  });
});
