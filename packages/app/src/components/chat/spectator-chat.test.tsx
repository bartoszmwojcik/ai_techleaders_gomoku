// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useChat } = vi.hoisted(() => ({ useChat: vi.fn() }));
vi.mock("./use-chat", () => ({ useChat }));

import { SpectatorChat } from "./spectator-chat";

const refresh = vi.fn();
const send = vi.fn();
const onGone = vi.fn();
const spectatorMessage = { id: 1, seat: null, spectatorName: "Ala", text: "Ładny ruch", createdAt: "2026-11-02T10:00:00.000Z" };
const chat = (over: Record<string, unknown> = {}) => ({
  loaded: true,
  state: "open",
  messages: [spectatorMessage],
  limits: { maxLength: 120, minIntervalMs: 2000 },
  opponentDisabled: false,
  fails: 0,
  pending: null,
  switching: false,
  refresh,
  send,
  ...over,
});
const players = [
  { seat: 1 as const, kind: "account" as const, displayName: "Ala_7" },
  { seat: 2 as const, kind: "guest" as const, displayName: "Kuba" },
];
const setup = (canWrite = true) => render(<SpectatorChat gameId="g1" players={players} canWrite={canWrite} onGone={onGone} />);

beforeEach(() => {
  useChat.mockReset().mockReturnValue(chat());
  refresh.mockReset();
  send.mockReset();
  onGone.mockReset();
});
afterEach(cleanup);

describe("SpectatorChat", () => {
  it("reads from the spectator's own endpoint", () => {
    setup();
    expect(useChat).toHaveBeenCalledWith({ gameId: "g1", onGone, path: "/api/games/g1/spectate/chat" });
  });

  it("shows the conversation marked as a spectator's, with a composer and no switch", () => {
    setup();
    expect(screen.getByTestId("chat-spectator").textContent).toBe("Widz · Ala");
    expect(screen.getByLabelText("Wiadomość")).toBeTruthy();
    expect(screen.queryByTestId("chat-switch")).toBeNull();
    expect(screen.queryByText("Wyłącz czat")).toBeNull();
  });

  it("names the players who write", () => {
    useChat.mockReturnValue(chat({ messages: [{ id: 2, seat: 2, text: "Cześć", createdAt: "2026-11-02T10:00:00.000Z" }] }));
    setup();
    expect(screen.getByTestId("chat-sender").textContent).toContain("Kuba");
  });

  it("labels a message on its way as the spectator's own", () => {
    useChat.mockReturnValue(chat({ pending: { clientId: "c", text: "w drodze" } }));
    setup();
    expect(screen.getByTestId("chat-pending").textContent).toContain("Widz · Ty");
  });

  it("lets a visitor without a nickname read and says how to write", () => {
    setup(false);
    expect(screen.getByText(spectatorMessage.text)).toBeTruthy();
    expect(screen.queryByLabelText("Wiadomość")).toBeNull();
    expect(screen.getByTestId("chat-read-only").textContent).toContain("wejdź z nickiem");
  });

  it("shows a skeleton while loading, and neither list nor composer", () => {
    useChat.mockReturnValue(chat({ loaded: false, messages: [] }));
    setup();
    expect(screen.getByText("Wczytujemy czat…")).toBeTruthy();
    expect(screen.queryByLabelText("Wiadomość")).toBeNull();
    expect(screen.queryByTestId("chat-read-only")).toBeNull();
  });

  it("says the chat is closed once it is", () => {
    useChat.mockReturnValue(chat({ state: "closed", messages: [] }));
    setup();
    expect(screen.getByText("Czat jest już zamknięty.")).toBeTruthy();
    expect(screen.queryByLabelText("Wiadomość")).toBeNull();
  });

  it("offers a retry after repeated failed reads", () => {
    useChat.mockReturnValue(chat({ fails: 3 }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default length without limits", () => {
    useChat.mockReturnValue(chat({ limits: null }));
    setup();
    expect(screen.getByText(/Pozostało 200 znaków/)).toBeTruthy();
  });

  it("folds, unfolds and explains the retention", () => {
    setup();
    const toggle = screen.getByTestId("chat-toggle");
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("Rozwiń czat");
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("Zwiń czat");
    const note = screen.getByTestId("chat-info");
    expect(note.hidden).toBe(true);
    fireEvent.click(screen.getByTestId("chat-info-toggle"));
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("Gracz może wyłączyć czat dla siebie");
  });
});
