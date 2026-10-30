// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, apiCall } = vi.hoisted(() => ({ push: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
// A value unlike the real one, so the text must come from the constant, not be typed in.
vi.mock("@gomoku/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gomoku/core")>()),
  CREATE_GAME_LIMIT: 7,
}));

import { GuestCreateForm } from "./guest-create-form";

const ok = { ok: true, data: { gameId: "g1" } };
const failure = (error: Record<string, unknown>) => ({ ok: false, error: { message: "x", ...error } });
const create = () => screen.getByRole("button", { name: "Rozumiem, utwórz zaproszenie" });
const nick = () => screen.getByLabelText(/Twój nick/) as HTMLInputElement;

beforeEach(() => {
  push.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("GuestCreateForm", () => {
  it("explains the nickname, the loss of access and the 24 hours", () => {
    render(<GuestCreateForm />);
    expect(screen.getByText("Zostaw puste, a będziesz „Gracz 1”")).toBeTruthy();
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(screen.getByText("Jeśli zmienisz przeglądarkę albo wyczyścisz dane, stracisz dostęp do tej partii.")).toBeTruthy();
    expect(screen.getByText("Zaproszenie jest ważne 24 godziny.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć" }).getAttribute("href")).toBe("/");
  });

  it("creates the game with the acknowledgement alone when the nickname is empty, and opens it staying busy", async () => {
    apiCall.mockResolvedValue(ok);
    render(<GuestCreateForm />);
    await userEvent.setup().click(create());
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { acknowledgedGuestWarning: true } });
    expect(push).toHaveBeenCalledWith("/games/g1");
    expect((screen.getByRole("button", { name: "Tworzenie zaproszenia…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the normalized nickname", async () => {
    apiCall.mockResolvedValue(ok);
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.type(nick(), "  Ala   ma  ");
    await u.click(create());
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { acknowledgedGuestWarning: true, nickname: "Ala ma" } });
  });

  it("submits with Enter in the field", async () => {
    apiCall.mockResolvedValue(ok);
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.type(nick(), "Ala{Enter}");
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("refuses an invalid nickname next to the field, keeps the text and sends nothing (p08.2)", async () => {
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.type(nick(), "<b>");
    await u.click(create());
    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.")).toBeTruthy();
    expect(nick().value).toBe("<b>");
    await vi.waitFor(() => expect(document.activeElement).toBe(nick()));
  });

  it("shows the server's refusal of the nickname in the same place", async () => {
    apiCall.mockResolvedValue(failure({ code: "VALIDATION", fieldErrors: { nickname: ["Nick nie jest dozwolony."] } }));
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.type(nick(), "Ala");
    await u.click(create());
    expect(screen.getByText("Nick nie jest dozwolony.")).toBeTruthy();
    expect(nick().value).toBe("Ala");
    expect((create() as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends only one request while busy", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<GuestCreateForm />);
    const button = create();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok));
  });

  it.each([
    [90, "Limit to 7 utworzeń na godzinę. Spróbuj ponownie za 2 min."],
    [undefined, "Limit to 7 utworzeń na godzinę. Spróbuj ponownie za jakiś czas."],
  ])("explains the address limit with the wait (%s)", async (retryAfterSeconds, text) => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds }));
    render(<GuestCreateForm />);
    await userEvent.setup().click(create());
    expect(screen.getByText("Zbyt wiele zaproszeń")).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("answers a server error with one sentence and a retry that sends again (p08.5)", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "INTERNAL" })).mockResolvedValueOnce(ok);
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.click(create());
    expect(screen.getByText("Nie udało się utworzyć zaproszenia. Spróbuj ponownie.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/games/g1");
  });

  it("answers a lost connection and offers a retry (p08.8)", async () => {
    apiCall.mockResolvedValue(failure({ code: "network" }));
    render(<GuestCreateForm />);
    await userEvent.setup().click(create());
    expect(screen.getByText("Brak połączenia")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
  });

  it("sends a browser with a game in progress to it (p08.6)", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS", data: { gameId: "g9" } }));
    render(<GuestCreateForm />);
    await userEvent.setup().click(create());
    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Przejdź do partii" }).getAttribute("href")).toBe("/games/g9");
    expect(screen.queryByRole("button", { name: "Anuluj i utwórz nową" })).toBeNull();
  });

  it("omits the link when the answer names no game", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS", data: { gameId: 5 } }));
    render(<GuestCreateForm />);
    await userEvent.setup().click(create());
    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Przejdź do partii" })).toBeNull();
  });

  it("offers to give up the own waiting game, asking first, then creates in one request (p08.7)", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "OWN_WAITING_GAME", data: { gameId: "g9" } })).mockResolvedValueOnce(ok);
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.type(nick(), "Ala");
    await u.click(create());
    expect(screen.getByText("Masz oczekującą partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć do partii" }).getAttribute("href")).toBe("/games/g9");

    await u.click(screen.getByRole("button", { name: "Anuluj i utwórz nową" }));
    expect(screen.getByText("Anulować poprzednie zaproszenie?")).toBeTruthy();
    expect(apiCall).toHaveBeenCalledTimes(1);
    await u.click(screen.getByRole("button", { name: "Tak, anuluj i utwórz nową" }));
    expect(apiCall).toHaveBeenLastCalledWith("/api/games", {
      body: { acknowledgedGuestWarning: true, nickname: "Ala", cancelOwnWaitingGame: true },
    });
    expect(push).toHaveBeenCalledWith("/games/g1");
  });

  it("closes the dialog with 'Wróć' without sending anything", async () => {
    apiCall.mockResolvedValue(failure({ code: "OWN_WAITING_GAME" }));
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.click(create());
    expect(screen.queryByRole("link", { name: "Wróć do partii" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Anuluj i utwórz nową" }));
    await u.click(screen.getByRole("button", { name: "Wróć" }));
    expect(screen.queryByText("Anulować poprzednie zaproszenie?")).toBeNull();
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open by Escape while the request runs, and closes it when the request fails", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "OWN_WAITING_GAME" }));
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.click(create());
    await u.click(screen.getByRole("button", { name: "Anuluj i utwórz nową" }));
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await u.click(screen.getByRole("button", { name: "Tak, anuluj i utwórz nową" }));
    await u.keyboard("{Escape}");
    expect(screen.getByText("Anulować poprzednie zaproszenie?")).toBeTruthy();
    await act(async () => finish(failure({ code: "INTERNAL" })));
    expect(screen.queryByText("Anulować poprzednie zaproszenie?")).toBeNull();
    expect(screen.getByText("Nie udało się utworzyć zaproszenia. Spróbuj ponownie.")).toBeTruthy();
  });

  it("refuses an invalid nickname from inside the dialog without sending", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "OWN_WAITING_GAME" }));
    const u = userEvent.setup();
    render(<GuestCreateForm />);
    await u.click(create());
    await u.type(nick(), "<>");
    await u.click(screen.getByRole("button", { name: "Anuluj i utwórz nową" }));
    await u.click(screen.getByRole("button", { name: "Tak, anuluj i utwórz nową" }));
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Anulować poprzednie zaproszenie?")).toBeNull();
    expect(screen.getByText("Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.")).toBeTruthy();
  });
});
