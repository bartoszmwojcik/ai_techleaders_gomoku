// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, replace, assign } = vi.hoisted(() => ({ apiCall: vi.fn(), replace: vi.fn(), assign: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { DeleteAccountForm } from "./delete-account-form";

type Game = { gameId: string; status: "waiting" | "active" } | null;

const failure = (error: {
  code: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string[]>;
  data?: Record<string, unknown>;
}) => ({ ok: false, error: { message: "x", ...error } });

const password = () => screen.getByLabelText(/^Hasło/) as HTMLInputElement;
const submit = () => screen.getByTestId("delete-account-submit") as HTMLButtonElement;
const checkbox = () => screen.getByRole("checkbox", { name: "Rozumiem, że tego nie da się cofnąć" });
const dialog = () => screen.getByRole("alertdialog", { name: "Usunąć konto Ala_7?" });
const confirmButton = () => within(dialog()).getByRole("button", { name: "Usuń konto na zawsze" });

function renderForm(currentGame: Game = null) {
  return render(<DeleteAccountForm displayName="Ala_7" currentGame={currentGame} />);
}

/** Types the password, ticks the box and opens the dialog. */
async function openDialog(text = "secret123") {
  const user = userEvent.setup();
  if (text) await user.type(password(), text);
  await user.click(checkbox());
  await user.click(submit());
  return user;
}

beforeEach(() => {
  apiCall.mockReset();
  replace.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { assign });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeleteAccountForm: the panel (s05.10)", () => {
  it("is a danger zone with the warning, the password field, the checkbox and a disabled button with its reason", () => {
    renderForm();
    const panel = screen.getByTestId("delete-account-panel");
    expect(panel.className).toContain("border-status-danger");
    expect(within(panel).getByRole("heading", { name: "Usuń konto" })).toBeTruthy();
    expect(screen.getByText("Tego nie da się cofnąć")).toBeTruthy();
    expect(screen.getByText(/Twoje konto, e-mail i hasło zostaną usunięte od razu i na zawsze/)).toBeTruthy();
    expect(password().getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByText("Podaj hasło, aby potwierdzić, że to Ty.")).toBeTruthy();
    expect(submit().disabled).toBe(true);
    expect(submit().getAttribute("aria-describedby")).toBe("delete-account-reason");
    expect(document.getElementById("delete-account-reason")?.textContent).toBe("Zaznacz potwierdzenie, aby usunąć konto.");
    expect(screen.queryByTestId("delete-account-active-game")).toBeNull();
    expect(screen.queryByTestId("delete-account-waiting")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("enables the button after the checkbox and drops the reason", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(checkbox());
    expect(submit().disabled).toBe(false);
    expect(submit().getAttribute("aria-describedby")).toBeNull();
    expect(document.getElementById("delete-account-reason")).toBeNull();
    await user.click(checkbox());
    expect(submit().disabled).toBe(true);
  });

  it("mentions the waiting game in the panel and in the dialog (s05.20)", async () => {
    renderForm({ gameId: "g1", status: "waiting" });
    expect(screen.getByTestId("delete-account-waiting").textContent).toBe(
      "Twoja oczekująca partia i jej zaproszenie zostaną usunięte.",
    );
    expect(screen.queryByTestId("delete-account-active-game")).toBeNull();
    await openDialog();
    expect(dialog().textContent).toContain("Twoja oczekująca partia i jej zaproszenie zostaną usunięte.");
  });
});

describe("DeleteAccountForm: a game in progress (s05.12)", () => {
  it("blocks with a link to the game and the way out, and keeps the button disabled", async () => {
    const user = userEvent.setup();
    renderForm({ gameId: "g7", status: "active" });
    const block = screen.getByTestId("delete-account-active-game");
    expect(within(block).getByText("Najpierw dokończ albo poddaj partię.")).toBeTruthy();
    expect(block.textContent).toContain("Na stronie partii wybierz „Poddaj partię”, a potem odśwież tę stronę.");
    expect(within(block).getByRole("link", { name: "Przejdź do partii" }).getAttribute("href")).toBe("/games/g7");
    expect(submit().disabled).toBe(true);
    expect(document.getElementById("delete-account-reason")?.textContent).toBe(
      "Usunięcie jest możliwe dopiero po zakończeniu partii.",
    );
    await user.click(checkbox());
    expect(submit().disabled).toBe(true);
  });

  it("shows the same block when the server answers 409 and moves focus to it", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME", data: { gameId: "g9" } }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());

    const block = await screen.findByTestId("delete-account-active-game");
    expect(within(block).getByRole("link", { name: "Przejdź do partii" }).getAttribute("href")).toBe("/games/g9");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(submit().disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(block));
  });

  it("treats a 409 without a game id as a failure to retry", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME" }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    expect(await within(dialog()).findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("delete-account-active-game")).toBeNull();
  });
});

describe("DeleteAccountForm: the dialog and the answers", () => {
  it("opens with focus on the way out, names the account and sends the password with the confirmation", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    renderForm();
    const user = await openDialog("secret123");

    expect(dialog()).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Zostaw konto" }));
    expect(dialog().textContent).toContain("Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”. Tego nie da się cofnąć.");
    expect(apiCall).not.toHaveBeenCalled();

    await user.click(confirmButton());
    expect(apiCall).toHaveBeenCalledExactlyOnceWith("/api/account/delete", {
      body: { password: "secret123", confirm: true },
    });
  });

  it("closes with Zostaw konto without sending and returns focus to the button", async () => {
    renderForm();
    const user = await openDialog();
    await user.click(within(dialog()).getByRole("button", { name: "Zostaw konto" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(submit()));
  });

  it("closes on Escape while asking", async () => {
    renderForm();
    const user = await openDialog();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks for the password in the panel instead of opening the dialog when it is empty (s05.16b)", async () => {
    renderForm();
    const user = await openDialog("");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Wpisz hasło.")).toBeTruthy();
    expect(password().getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(password()));
    await user.type(password(), "x");
    expect(screen.queryByText("Wpisz hasło.")).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("success: reloads on the notice page (s04.14)", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith("/?notice=account-deleted"));
  });

  it("sends once for a double click (a ref, not state)", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    await openDialog();
    const button = confirmButton();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish({ ok: true, data: null }));
  });

  it("keeps the dialog open and blocks Escape while the server works", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    await user.keyboard("{Escape}");
    expect(dialog()).toBeTruthy();
    await act(async () => finish({ ok: true, data: null }));
  });

  it("wrong password (400): closes the dialog, clears the field, shows the error and focuses it (s05.16)", async () => {
    apiCall.mockResolvedValue(failure({ code: "INVALID_PASSWORD", fieldErrors: { password: ["Nieprawidłowe hasło."] } }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());

    expect(await screen.findByText("Nieprawidłowe hasło.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(password().value).toBe("");
    expect(password().getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(password()));
    expect(screen.queryByText(/pozostało/)).toBeNull();
  });

  it("wrong password without a field message falls back to the standard text", async () => {
    apiCall.mockResolvedValue(failure({ code: "INVALID_PASSWORD" }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    expect(await screen.findByText("Nieprawidłowe hasło.")).toBeTruthy();
  });

  it("limit (429): shows the wait in minutes and closes the dialog (s05.17)", async () => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds: 720 }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());

    const error = await screen.findByTestId("delete-account-error");
    expect(error.textContent).toContain("Zbyt wiele prób");
    expect(error.textContent).toContain("Spróbuj ponownie za 12 min.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("limit (429) without a wait time and under a minute", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "RATE_LIMITED" }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    expect((await screen.findByTestId("delete-account-error")).textContent).toContain("Spróbuj ponownie za jakiś czas.");

    apiCall.mockResolvedValueOnce(failure({ code: "RATE_LIMITED", retryAfterSeconds: 5 }));
    await user.click(submit());
    await user.click(confirmButton());
    await waitFor(() => expect(screen.getByTestId("delete-account-error").textContent).toContain("Spróbuj ponownie za 1 min."));
  });

  it.each([
    ["a server failure", failure({ code: "INTERNAL" })],
    ["a network failure", failure({ code: "network" })],
  ])("%s: the dialog stays open with the message and a retry works (s05.18)", async (_name, answer) => {
    apiCall.mockResolvedValueOnce(answer);
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toBe("Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie.");
    expect(password().value).toBe("secret123");

    apiCall.mockResolvedValueOnce({ ok: true, data: null });
    await user.click(confirmButton());
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("clears the message when the dialog is opened again", async () => {
    apiCall.mockResolvedValue(failure({ code: "network" }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    await within(dialog()).findByRole("alert");
    await user.click(within(dialog()).getByRole("button", { name: "Zostaw konto" }));
    await user.click(submit());
    expect(within(dialog()).queryByRole("alert")).toBeNull();
  });

  it("session expired (401): sends to sign-in and back to the account page (s05.19)", async () => {
    apiCall.mockResolvedValue(failure({ code: "UNAUTHORIZED" }));
    renderForm();
    const user = await openDialog();
    await user.click(confirmButton());
    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/login?next=%2Faccount"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("hides and shows the password", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    expect(password().type).toBe("text");
  });
});
