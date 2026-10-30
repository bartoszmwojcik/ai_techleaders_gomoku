import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "../src/App";
import "../src/review/comments.js";
import "../src/review/prototype.js";
import { deleteFailures, advanceClock, clockSteps, getSim, patchScenario, resetSim, resignElsewhere, switchAccount, opponentJoinsWaitingGame, refreshAccountView } from "../src/sim";

// Account deletion (E01-S06, #37): states s05.10–s05.20, s04.14 and s08 of the prototype.
const PASSWORD = "drewniana-plansza-2026";
const current = () => document.querySelector(".screen.is-current")?.id;
const frame = () => document.querySelector(".screen.is-current .frame") as HTMLElement;
const inFrame = () => within(frame());
const goTo = (id: string) => act(() => void document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: id })));

function start(account: string) {
  render(<App />);
  act(() => {
    window.__PROTOTYPE_START__?.();
  });
  if (!current()) goTo("s01");
  act(() => switchAccount(account));
  goTo("s05");
}

beforeAll(() => {
  document.documentElement.setAttribute("data-start-screen", "s01");
});

afterEach(() => {
  cleanup();
  act(() => resetSim());
  window.location.hash = "";
});

const password = () => inFrame().getByLabelText("Hasło") as HTMLInputElement;
const submit = () => inFrame().getByRole("button", { name: "Usuń konto na zawsze" }) as HTMLButtonElement;
const tick = (name: string) => fireEvent.click(inFrame().getByRole("checkbox", { name }));
const fillAndAsk = (value: string) => {
  fireEvent.change(password(), { target: { value } });
  tick("Rozumiem, że tego nie da się cofnąć");
  fireEvent.click(submit());
};
const dialogConfirm = async () => {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Usuń konto na zawsze" }));
};

describe("usunięcie konta, ekran s05", () => {
  it("s05.10: przycisk jest nieaktywny, dopóki nie ma zaznaczenia, i podaje powód", () => {
    start("A1");
    expect(submit().disabled).toBe(true);
    expect(submit().getAttribute("aria-describedby")).toBe("delete-account-reason");
    expect(inFrame().getByText("Zaznacz potwierdzenie, aby usunąć konto.")).toBeTruthy();
    expect(inFrame().queryByText(/oczekująca partia/)).toBeNull();
    tick("Rozumiem, że tego nie da się cofnąć");
    expect(submit().disabled).toBe(false);
  });

  it("s05.14: dialog z nazwą konta, fokus na „Zostaw konto”, Anuluj nic nie zmienia", async () => {
    start("A1");
    fillAndAsk(PASSWORD);
    const dialog = await screen.findByRole("alertdialog", { name: "Usunąć konto Ala_7?" });
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Zostaw konto"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Zostaw konto" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(getSim().accounts["ala@example.com"]).toBeTruthy();
  });

  it("s05.16b: puste hasło daje błąd przy polu i nie otwiera dialogu", () => {
    start("A1");
    tick("Rozumiem, że tego nie da się cofnąć");
    fireEvent.click(submit());
    expect(inFrame().getByText("Wpisz hasło.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(password().getAttribute("aria-invalid")).toBe("true");
  });

  it("s05.16: błędne hasło zamyka dialog, pokazuje błąd przy polu i liczy próby", async () => {
    start("A1");
    for (let i = 1; i <= 7; i++) {
      fireEvent.change(password(), { target: { value: `zle-${i}` } });
      if (i === 1) tick("Rozumiem, że tego nie da się cofnąć");
      fireEvent.click(submit());
      await dialogConfirm();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      if (i === 1) {
        expect(inFrame().getByText("Nieprawidłowe hasło.")).toBeTruthy();
        expect(password().getAttribute("aria-invalid")).toBe("true");
      }
    }
    expect(inFrame().getByText("Nieprawidłowe hasło. Zostało prób: 3, potem blokada na 15 minut.")).toBeTruthy();
  });

  it("s05.17: po 10 błędach nawet dobre hasło daje limit z czasem; okno wygasa po zegarze demo", async () => {
    start("A1");
    tick("Rozumiem, że tego nie da się cofnąć");
    for (let i = 1; i <= 10; i++) {
      fireEvent.change(password(), { target: { value: `zle-${i}` } });
      fireEvent.click(submit());
      await dialogConfirm();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    }
    fireEvent.change(password(), { target: { value: PASSWORD } });
    fireEvent.click(submit());
    await dialogConfirm();
    await waitFor(() => expect(inFrame().getByText("Zbyt wiele prób")).toBeTruthy());
    expect(inFrame().getByText(/Spróbuj ponownie za \d+ min\./)).toBeTruthy();
    expect(getSim().accounts["ala@example.com"]).toBeTruthy();
    act(() => advanceClock(clockSteps.hour));
    fireEvent.click(submit());
    await dialogConfirm();
    await waitFor(() => expect(current()).toBe("s04"));
  });

  it("licznik błędnych haseł jest per konto", async () => {
    start("A1");
    fireEvent.change(password(), { target: { value: "zle" } });
    tick("Rozumiem, że tego nie da się cofnąć");
    fireEvent.click(submit());
    await dialogConfirm();
    await waitFor(() => expect(getSim().deleteFails.count).toBe(1));
    act(() => switchAccount("A3"));
    expect(deleteFailures(getSim())).toBe(0);
  });

  it("s05.17: wymuszony limit pokazuje 12 min", async () => {
    start("A1");
    act(() => patchScenario({ deleteLimit: true }));
    fillAndAsk(PASSWORD);
    await dialogConfirm();
    await waitFor(() => expect(inFrame().getByText("Spróbuj ponownie za 12 min.")).toBeTruthy());
  });

  it("s05.18: błąd serwera i brak sieci zostawiają dialog otwarty z komunikatem", async () => {
    start("A1");
    act(() => patchScenario({ deleteServerError: true }));
    fillAndAsk(PASSWORD);
    await dialogConfirm();
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe("Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie."));
    expect(getSim().accounts["ala@example.com"]).toBeTruthy();
    act(() => patchScenario({ deleteServerError: false, forceNetworkError: true }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Usuń konto na zawsze" }));
    await waitFor(() => expect(within(screen.getByRole("alertdialog")).getByRole("alert")).toBeTruthy());
    act(() => patchScenario({ forceNetworkError: false }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Usuń konto na zawsze" }));
    await waitFor(() => expect(current()).toBe("s04"));
  });

  it("s05.19: wygasła sesja odsyła na logowanie", async () => {
    start("A1");
    act(() => patchScenario({ deleteSessionExpired: true }));
    fillAndAsk(PASSWORD);
    await dialogConfirm();
    await waitFor(() => expect(current()).toBe("s02"));
    expect(getSim().session).toBeNull();
  });

  it("s05.12: partia w toku blokuje przycisk, daje link, a po poddaniu i odświeżeniu usunięcie przechodzi", async () => {
    start("A3");
    const block = document.querySelector("[data-testid=delete-account-active-game]") as HTMLElement;
    expect(within(block).getByText("Najpierw dokończ albo poddaj partię.")).toBeTruthy();
    expect(within(block).getByRole("link", { name: "Przejdź do partii" })).toBeTruthy();
    tick("Rozumiem, że tego nie da się cofnąć");
    expect(submit().disabled).toBe(true);
    expect(inFrame().getByText("Usunięcie jest możliwe dopiero po zakończeniu partii.")).toBeTruthy();
    act(() => resignElsewhere());
    expect(document.querySelector("[data-testid=delete-account-active-game]")).not.toBeNull();
    act(() => refreshAccountView());
    expect(document.querySelector("[data-testid=delete-account-active-game]")).toBeNull();
    fireEvent.change(password(), { target: { value: PASSWORD } });
    fireEvent.click(submit());
    await dialogConfirm();
    await waitFor(() => expect(current()).toBe("s04"));
  });

  it("s05.11 i s05.20: oczekująca partia ma ostrzeżenie, a dołączenie przeciwnika w międzyczasie daje 409 z blokadą", async () => {
    start("A8");
    expect(inFrame().getByTestId("delete-account-waiting").textContent).toContain("Twoja oczekująca partia i jej zaproszenie zostaną usunięte.");
    fireEvent.change(password(), { target: { value: PASSWORD } });
    tick("Rozumiem, że tego nie da się cofnąć");
    act(() => opponentJoinsWaitingGame());
    fireEvent.click(submit());
    await dialogConfirm();
    await waitFor(() => expect(document.querySelector("[data-testid=delete-account-active-game]")).not.toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-testid=delete-account-active-game]")));
    expect(getSim().accounts["ola@example.com"]).toBeTruthy();
  });

  it("podwójne kliknięcie „Usuń konto na zawsze” wysyła jedno żądanie", async () => {
    start("A1");
    fillAndAsk(PASSWORD);
    const dialog = await screen.findByRole("alertdialog");
    const button = within(dialog).getByRole("button", { name: "Usuń konto na zawsze" });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(current()).toBe("s04"));
    expect(getSim().deleteFails.count).toBe(0);
  });

  it("sukces: konto znika, s04.14 pokazuje komunikat, logowanie nie działa, rejestracja tym samym e-mailem tak, s08 pokazuje Usuniętego gracza", async () => {
    start("A8");
    fillAndAsk(PASSWORD);
    await dialogConfirm();
    await waitFor(() => expect(current()).toBe("s04"));
    expect(getSim().accounts["ola@example.com"]).toBeUndefined();
    expect(getSim().session).toBeNull();
    expect(inFrame().getByText("Konto zostało usunięte")).toBeTruthy();
    fireEvent.click(inFrame().getByRole("button", { name: "Zamknij" }));
    expect(inFrame().queryByText("Konto zostało usunięte")).toBeNull();
    goTo("s08");
    expect(inFrame().getByTestId("opponent-name").textContent).toContain("Usunięty gracz");
    expect(inFrame().queryByText("Rewanż niedostępny")).toBeNull();
    act(() => patchScenario({ rematchNotice: true }));
    expect(inFrame().getByText("Rewanż niedostępny")).toBeTruthy();
    act(() => patchScenario({ rematchPending: true }));
    expect(inFrame().getByText("Zaproszenie do rewanżu odrzucone")).toBeTruthy();
    act(() => patchScenario({ opponentIsGuest: true }));
    expect(inFrame().getByText(/Piotr \(gość\)/)).toBeTruthy();
  });
});
