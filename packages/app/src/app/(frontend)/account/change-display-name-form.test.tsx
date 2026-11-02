// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, replace, refresh } = vi.hoisted(() => ({ apiCall: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

import { ChangeDisplayNameForm } from "./change-display-name-form";

const failure = (error: { code: string; retryAfterSeconds?: number; fieldErrors?: Record<string, string[]> }) => ({
  ok: false,
  error: { message: "x", ...error },
});
const field = () => screen.getByLabelText(/^Nazwa gracza/) as HTMLInputElement;

async function change(to: string) {
  const user = userEvent.setup();
  await user.clear(field());
  if (to) await user.type(field(), to);
  await user.click(screen.getByRole("button", { name: "Zmień nazwę" }));
}

beforeEach(() => {
  apiCall.mockReset();
  replace.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe("ChangeDisplayNameForm", () => {
  it("shows the current name and the hint", () => {
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    expect(field().value).toBe("Ala_7");
    expect(screen.getByText(/raz na dobę/)).toBeTruthy();
    expect(screen.queryByTestId("change-name-locked")).toBeNull();
  });

  it("sends the new name with PATCH, announces it, refreshes and locks the form for a day", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { displayName: "Nowa_7" } });
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Nowa_7");

    await waitFor(() => expect(screen.getByTestId("change-name-success").textContent).toContain("Nazwa gracza zmieniona"));
    expect(apiCall).toHaveBeenCalledWith("/api/auth/display-name", { method: "PATCH", body: { displayName: "Nowa_7" } });
    expect(refresh).toHaveBeenCalledOnce();
    expect(field().disabled).toBe(true);
    expect(screen.getByTestId("change-name-locked").textContent).toContain("Kolejna zmiana możliwa po");
  });

  it("starts locked when the window has not passed", () => {
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt="2026-11-03T04:00:00.000Z" />);
    expect(field().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Zmień nazwę" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("change-name-locked").textContent).toContain("3 listopada");
  });

  it("refuses an invalid name before sending", async () => {
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Agent");
    expect(screen.getByText("Ta nazwa jest zastrzeżona.")).toBeTruthy();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("shows the server's field error for a taken name", async () => {
    apiCall.mockResolvedValue(failure({ code: "CONFLICT", fieldErrors: { displayName: ["Ta nazwa gracza jest już zajęta."] } }));
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Zajeta_7");
    expect(await screen.findByText("Ta nazwa gracza jest już zajęta.")).toBeTruthy();
    expect(field().disabled).toBe(false);
  });

  it("locks the form when the server says the window is still open", async () => {
    apiCall.mockResolvedValue(failure({ code: "DISPLAY_NAME_COOLDOWN", retryAfterSeconds: 3600 }));
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Nowa_7");
    await waitFor(() => expect(field().disabled).toBe(true));
    expect(screen.getByTestId("change-name-locked")).toBeTruthy();
  });

  it("locks the form even when the server gives no seconds", async () => {
    apiCall.mockResolvedValue(failure({ code: "DISPLAY_NAME_COOLDOWN" }));
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Nowa_7");
    await waitFor(() => expect(field().disabled).toBe(true));
  });

  it.each([
    [{ code: "RATE_LIMITED", retryAfterSeconds: 120 }, "Spróbuj ponownie za 2 min."],
    [{ code: "RATE_LIMITED" }, "Spróbuj ponownie za jakiś czas."],
    [{ code: "network" }, "Nie udało się połączyć z serwerem. Spróbuj ponownie."],
    [{ code: "INTERNAL" }, "Spróbuj ponownie."],
  ])("explains %j", async (error, text) => {
    apiCall.mockResolvedValue(failure(error));
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Nowa_7");
    expect((await screen.findByTestId("change-name-error")).textContent).toContain(text);
  });

  it("sends a signed-out user to the login page and back", async () => {
    apiCall.mockResolvedValue(failure({ code: "UNAUTHORIZED" }));
    render(<ChangeDisplayNameForm displayName="Ala_7" availableAt={null} />);
    await change("Nowa_7");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Faccount"));
  });
});
