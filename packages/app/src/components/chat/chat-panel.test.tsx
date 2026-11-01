// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useChat } = vi.hoisted(() => ({ useChat: vi.fn() }));
vi.mock("./use-chat", () => ({ useChat }));

import type { GameView } from "@/server/http/game-view";

import { ChatPanel } from "./chat-panel";

const message = (id: number, seat: 1 | 2, text = `tekst ${id}`) => ({ id, seat, text, createdAt: "2026-11-01T10:00:00.000Z" });
const refresh = vi.fn();
const send = vi.fn();
const setEnabled = vi.fn();
const onGone = vi.fn();
const chat = (over: Record<string, unknown> = {}) => ({
  loaded: true,
  state: "open",
  messages: [],
  limits: { maxLength: 120, minIntervalMs: 2000 },
  fails: 0,
  pending: null,
  switching: false,
  refresh,
  send,
  setEnabled,
  ...over,
});
const game = (over: Partial<Pick<GameView, "status" | "players">> = {}): Pick<GameView, "status" | "players" | "you"> => ({
  status: "active",
  you: { seat: 1, kind: "account" },
  players: [
    { seat: 1, kind: "account", displayName: "Ala_7", seen: true },
    { seat: 2, kind: "account", displayName: "Kuba_P", seen: true },
  ],
  ...over,
});
const setup = (g = game()) => render(<ChatPanel gameId="g1" game={g} onGone={onGone} />);
const toggle = () => screen.getByTestId("chat-toggle");

beforeEach(() => {
  useChat.mockReset().mockReturnValue(chat());
  refresh.mockReset();
  send.mockReset();
  setEnabled.mockReset().mockResolvedValue({ ok: true });
  onGone.mockReset();
});
afterEach(cleanup);

describe("ChatPanel, games without a chat", () => {
  it("shows only a sentence while the game waits, and reads nothing", () => {
    setup(game({ status: "waiting" }));
    expect(screen.getByRole("heading", { name: "Czat" })).toBeTruthy();
    expect(screen.getByText("Czat będzie dostępny, gdy przeciwnik dołączy do partii.")).toBeTruthy();
    expect(screen.queryByLabelText("Wiadomość")).toBeNull();
    expect(useChat).not.toHaveBeenCalled();
  });

  it("shows nothing for a cancelled game", () => {
    const { container } = setup(game({ status: "cancelled" }));
    expect(container.innerHTML).toBe("");
    expect(useChat).not.toHaveBeenCalled();
  });
});

describe("ChatPanel, an open chat", () => {
  it("shows the opponent, the conversation signed by name with 'Ty' on your own, and the form", () => {
    useChat.mockReturnValue(chat({ messages: [message(1, 2, "Cześć"), message(2, 1, "Hej")] }));
    setup();

    expect(useChat).toHaveBeenCalledWith({ gameId: "g1", onGone });
    expect(screen.getByText("Kuba_P", { selector: "p span" })).toBeTruthy();
    const items = screen.getAllByTestId("chat-message");
    expect(items[0]!.textContent).toContain("Kuba_P");
    expect(items[0]!.textContent).toContain("Cześć");
    expect(items[1]!.textContent).toContain("Ty (Ala_7)");
    expect(screen.getByLabelText("Wiadomość")).toBeTruthy();
    expect(screen.getByText("Pozostało 120 znaków")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the names of the chat out of the page's own `player-name` count", () => {
    useChat.mockReturnValue(chat({ messages: [message(1, 2)] }));
    setup(game({ players: [{ seat: 1, kind: "guest", displayName: "Zoja", seen: true }, { seat: 2, kind: "guest", displayName: "Kuba", seen: true }] }));
    expect(document.querySelectorAll("[data-testid=player-name]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-testid=chat-sender]").length).toBeGreaterThan(0);
  });

  it("signs a guest and an agent the way the game does", () => {
    useChat.mockReturnValue(chat({ messages: [message(1, 2, "Hej")] }));
    setup(
      game({
        players: [
          { seat: 1, kind: "guest", displayName: "Zoja", seen: true },
          { seat: 2, kind: "agent", displayName: null, agentName: "claude opus 5.5", seen: true },
        ],
      }),
    );
    const item = screen.getByTestId("chat-message");
    expect(item.textContent).toContain("Agent");
    expect(item.textContent).toContain("claude opus 5.5");
    expect(item.textContent).toContain("(deklarowane)");
  });

  it("forwards a message on its way as yours and uses the default length before the limits are known", () => {
    useChat.mockReturnValue(chat({ pending: { clientId: "c", text: "w drodze" }, limits: null }));
    setup();
    expect(screen.getByTestId("chat-pending").textContent).toContain("Ty (Ala_7)");
    expect(screen.getByText("Pozostało 200 znaków")).toBeTruthy();
  });

  it("renders on the server", () => {
    expect(renderToStaticMarkup(<ChatPanel gameId="g1" game={game()} onGone={onGone} />)).toContain("Czat");
  });
});

describe("ChatPanel, the other states", () => {
  it("shows a skeleton, says it is loading and blocks the form until the first read", () => {
    useChat.mockReturnValue(chat({ loaded: false, limits: null }));
    setup();
    const busy = screen.getAllByRole("status").find((element) => element.getAttribute("aria-busy") === "true")!;
    expect(within(busy).getByText("Wczytujemy czat…")).toBeTruthy();
    expect((screen.getByLabelText("Wiadomość") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText("Wczytujemy czat…").length).toBeGreaterThan(0);
    expect(screen.queryByRole("log")).toBeNull();
  });

  it.each([
    ["closed", "Czat jest już zamknięty."],
    ["unavailable", "Czat będzie dostępny, gdy przeciwnik dołączy do partii."],
    ["disabled_by_you", "Wyłączyłeś czat. Nie widzisz wiadomości rozmówcy i nie możesz pisać. Rozmówca zobaczy, że czat jest wyłączony."],
  ])("says %s in a sentence and has no form", (state, sentence) => {
    useChat.mockReturnValue(chat({ state }));
    setup();
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.queryByLabelText("Wiadomość")).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("keeps the conversation when the opponent turned the chat off, tells you, and blocks the form with the reason", () => {
    useChat.mockReturnValue(chat({ state: "disabled_by_opponent", messages: [message(1, 2, "Przed")] }));
    setup();

    expect(screen.getByText("Rozmówca wyłączył czat. Nie możesz teraz pisać.")).toBeTruthy();
    expect(screen.getByText("Pisanie jest zablokowane: rozmówca wyłączył czat.")).toBeTruthy();
    expect(screen.getAllByRole("status").some((element) => element.textContent?.includes("Rozmówca wyłączył czat"))).toBe(true);
    expect(screen.getByText("Przed")).toBeTruthy();
    expect((screen.getByLabelText("Wiadomość") as HTMLInputElement).disabled).toBe(true);
  });

  it("offers a retry only after three failed reads in a row", () => {
    useChat.mockReturnValue(chat({ fails: 2 }));
    setup();
    expect(screen.queryByText("Nie udało się odświeżyć czatu. Ponawiamy próby.")).toBeNull();
    cleanup();

    useChat.mockReturnValue(chat({ fails: 3 }));
    setup();
    expect(screen.getByText("Nie udało się odświeżyć czatu. Ponawiamy próby.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("ChatPanel, folding", () => {
  const withMessages = (...messages: ReturnType<typeof message>[]) => useChat.mockReturnValue(chat({ messages }));

  it("folds away the body without stopping the hook, and unfolds it again", () => {
    setup();
    expect(toggle().textContent).toBe("Zwiń czat");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const bodyId = toggle().getAttribute("aria-controls")!;

    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("Rozwiń czat");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(bodyId)!.hidden).toBe(true);
    expect(useChat).toHaveBeenCalled();

    fireEvent.click(toggle());
    expect(document.getElementById(bodyId)!.hidden).toBe(false);
    expect(toggle().textContent).toBe("Zwiń czat");
  });

  it("counts the opponent's messages that came while it was folded, in words, and announces them", () => {
    withMessages(message(1, 2), message(2, 1));
    const view = setup();
    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("Rozwiń czat");

    useChat.mockReturnValue(chat({ messages: [message(1, 2), message(2, 1), message(3, 2), message(4, 1), message(5, 2)] }));
    view.rerender(<ChatPanel gameId="g1" game={game()} onGone={onGone} />);
    expect(toggle().textContent).toBe("Czat (2 nowe)");
    expect(screen.getByText("Czat: 2 nowe")).toBeTruthy();

    useChat.mockReturnValue(chat({ messages: [message(1, 2), message(2, 1), message(3, 2)] }));
    view.rerender(<ChatPanel gameId="g1" game={game()} onGone={onGone} />);
    expect(toggle().textContent).toBe("Czat (1 nowa)");

    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("Zwiń czat");
    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("Rozwiń czat");
  });
});

describe("ChatPanel, turning the chat off and on", () => {
  const switchButton = () => screen.getByTestId("chat-switch") as HTMLButtonElement;

  it("offers 'Wyłącz czat' for an open chat and sends the change", () => {
    setup();
    expect(switchButton().textContent).toBe("Wyłącz czat");
    expect(switchButton().getAttribute("aria-busy")).toBeNull();
    fireEvent.click(switchButton());
    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it("offers 'Włącz czat' when you turned it off, and says what that means", () => {
    useChat.mockReturnValue(chat({ state: "disabled_by_you" }));
    setup();
    expect(switchButton().textContent).toBe("Włącz czat");
    fireEvent.click(switchButton());
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(screen.getAllByRole("status").some((element) => element.textContent?.startsWith("Wyłączyłeś czat."))).toBe(true);
  });

  it("keeps 'Wyłącz czat' when the opponent turned it off", () => {
    useChat.mockReturnValue(chat({ state: "disabled_by_opponent" }));
    setup();
    expect(switchButton().textContent).toBe("Wyłącz czat");
    expect(switchButton().disabled).toBe(false);
  });

  it("stays reachable when the panel is folded", () => {
    setup();
    fireEvent.click(toggle());
    expect(switchButton().closest("[hidden]")).toBeNull();
  });

  it("is blocked, with the reason, until the first read", () => {
    useChat.mockReturnValue(chat({ loaded: false, limits: null }));
    setup();
    expect(switchButton().disabled).toBe(true);
    const reason = document.getElementById(switchButton().getAttribute("aria-describedby")!)!;
    expect(reason.textContent).toBe("Wczytujemy czat…");
  });

  it("is busy while the change is in flight", () => {
    useChat.mockReturnValue(chat({ switching: true }));
    setup();
    expect(switchButton().getAttribute("aria-busy")).toBe("true");
    // Still enabled: a disabled button would drop the keyboard focus.
    expect(switchButton().disabled).toBe(false);
  });

  it.each(["unavailable", "closed"])("is not offered for %s", (state) => {
    useChat.mockReturnValue(chat({ state }));
    setup();
    expect(screen.queryByTestId("chat-switch")).toBeNull();
  });

  it("shows an alert for a failed change, in the words of the change, and clears it on the next attempt", async () => {
    setEnabled.mockResolvedValueOnce({ ok: false, kind: "failed" });
    setup();
    fireEvent.click(switchButton());
    expect(await screen.findByText("Nie udało się wyłączyć czatu. Spróbuj ponownie.")).toBeTruthy();
    fireEvent.click(switchButton());
    await vi.waitFor(() => expect(screen.queryByText("Nie udało się wyłączyć czatu. Spróbuj ponownie.")).toBeNull());
    expect(setEnabled).toHaveBeenCalledTimes(2);
  });

  it("words a failed turning on differently", async () => {
    useChat.mockReturnValue(chat({ state: "disabled_by_you" }));
    setEnabled.mockResolvedValueOnce({ ok: false, kind: "failed" });
    setup();
    fireEvent.click(switchButton());
    expect(await screen.findByText("Nie udało się włączyć czatu. Spróbuj ponownie.")).toBeTruthy();
  });

  it.each(["refused", "busy"])("shows no alert for %s", async (kind) => {
    setEnabled.mockResolvedValueOnce({ ok: false, kind });
    setup();
    fireEvent.click(switchButton());
    await vi.waitFor(() => expect(setEnabled).toHaveBeenCalled());
    expect(screen.queryByText(/Nie udało się wyłączyć/)).toBeNull();
  });

  it("keeps the focus on the same button when the label changes", () => {
    useChat.mockReturnValue(chat());
    const view = setup();
    switchButton().focus();
    const before = switchButton();
    useChat.mockReturnValue(chat({ state: "disabled_by_you" }));
    view.rerender(<ChatPanel gameId="g1" game={game()} onGone={onGone} />);
    expect(switchButton()).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.textContent).toBe("Włącz czat");
  });

  it("remembers nothing in the browser", () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    setup();
    fireEvent.click(switchButton());
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});
