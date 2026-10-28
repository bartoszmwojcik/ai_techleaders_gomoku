import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "../src/App";
import "../src/review/comments.js";
import "../src/review/prototype.js";
import { accountExists, advanceClock, getSim, giveAccountAGame, resetSim, switchAccount } from "../src/sim";

const current = () => document.querySelector(".screen.is-current")?.id;
const frame = () => document.querySelector(".screen.is-current .frame") as HTMLElement;
const inFrame = () => within(frame());
const goTo = (id: string) => act(() => void document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: id })));

function start() {
  render(<App />);
  act(() => {
    window.__PROTOTYPE_START__?.();
  });
  // The engine is a module-level singleton: after the first test it only needs to be pointed at the new DOM.
  if (!current()) goTo("s01");
}

beforeAll(() => {
  // The engine starts at the screen from `data-start-screen`.
  document.documentElement.setAttribute("data-start-screen", "s01");
});

afterEach(() => {
  cleanup();
  act(() => resetSim());
  window.location.hash = "";
});

const type = (label: RegExp | string, value: string) => fireEvent.change(inFrame().getByLabelText(label), { target: { value } });

describe("nawigacja między ekranami", () => {
  it("startuje na s01 i pozwala wybrać każdy ekran z paska", () => {
    start();
    expect(current()).toBe("s01");
    for (const id of ["s02", "s03", "s04", "s05", "s06", "s07", "s01"]) {
      const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `#${id}` && a.closest(".screen-nav"))!;
      fireEvent.click(link);
      expect(current(), `pasek → ${id}`).toBe(id === "s05" && !getSim().session ? "s02" : id);
    }
  });

  it("przyciski „Zaloguj się” i „Załóż konto” prowadzą do s02 i s01", () => {
    start();
    goTo("s04");
    fireEvent.click(inFrame().getByRole("link", { name: "Zaloguj się" }));
    expect(current()).toBe("s02");
    fireEvent.click(inFrame().getByRole("link", { name: "Załóż konto" }));
    expect(current()).toBe("s01");
    goTo("s04");
    fireEvent.click(inFrame().getByRole("link", { name: "Załóż konto" }));
    expect(current()).toBe("s01");
  });

  it("rejestracja → s04 z banerem → skrzynka → potwierdzenie → s04 bez banera", async () => {
    start();
    type("E-mail", "kuba@example.com");
    type("Nazwa gracza", "Kuba_P");
    type("Hasło", "drewniana-plansza-2026");
    fireEvent.click(inFrame().getByRole("button", { name: "Załóż konto" }));
    await waitFor(() => expect(current()).toBe("s04"));
    expect(inFrame().getByText("Potwierdź adres e-mail")).toBeTruthy();
    // BR-26: an unconfirmed e-mail blocks nothing, so the game actions and Lobby are there from the start.
    expect(inFrame().getByRole("button", { name: "Utwórz zaproszenie" }).hasAttribute("disabled")).toBe(false);
    expect(inFrame().getByText("Lobby")).toBeTruthy();
    goTo("s06");
    fireEvent.click(inFrame().getByRole("button", { name: "Potwierdź adres e-mail" }));
    expect(current()).toBe("s03");
    fireEvent.click(inFrame().getByRole("button", { name: "Potwierdź e-mail" }));
    await waitFor(() => expect(inFrame().getByText("Adres potwierdzony")).toBeTruthy());
    fireEvent.click(inFrame().getByRole("button", { name: "Przejdź dalej" }));
    expect(current()).toBe("s04");
    expect(inFrame().queryByText("Potwierdź adres e-mail")).toBeNull();
    expect(inFrame().getByText("Lobby")).toBeTruthy();
  });

  it("konto bez sesji odsyła na logowanie i po zalogowaniu wraca na s05", async () => {
    start();
    goTo("s05");
    await waitFor(() => expect(current()).toBe("s02"));
    type("E-mail", "ala@example.com");
    type("Hasło", "drewniana-plansza-2026");
    fireEvent.click(within(frame().querySelector("form")!).getByRole("button", { name: "Zaloguj się" }));
    await waitFor(() => expect(current()).toBe("s05"));
    expect(inFrame().getByText("ala@example.com")).toBeTruthy();
  });

  it("wylogowanie z s05 prowadzi na s04 w widoku niezalogowanego", async () => {
    start();
    act(() => switchAccount("A1"));
    goTo("s05");
    fireEvent.click(inFrame().getByRole("button", { name: "Wyloguj" }));
    await waitFor(() => expect(current()).toBe("s04"));
    expect(inFrame().getByRole("link", { name: "Załóż konto" })).toBeTruthy();
  });

  it("wylogowanie ze strony głównej (s04) zostaje na s04 w widoku niezalogowanego", async () => {
    start();
    act(() => switchAccount("A1"));
    goTo("s04");
    fireEvent.click(inFrame().getByRole("button", { name: "Wyloguj" }));
    await waitFor(() => expect(inFrame().getByRole("link", { name: "Załóż konto" })).toBeTruthy());
    expect(current()).toBe("s04");
  });

  it("zalogowany na s01 i s02 jest odsyłany na s04", () => {
    start();
    act(() => switchAccount("A1"));
    goTo("s01");
    expect(current()).toBe("s04");
    goTo("s02");
    expect(current()).toBe("s04");
  });

  it("gość z aktywną partią widzi blokadę na s01 i s02", () => {
    start();
    act(() => switchAccount("A6"));
    goTo("s01");
    expect(inFrame().getByText("Trwa Twoja partia jako gość")).toBeTruthy();
    goTo("s02");
    expect(inFrame().getByText("Trwa Twoja partia jako gość")).toBeTruthy();
  });

  it("miejsca poza prototypem otwierają dialog, a „Wróć do prototypu” go zamyka", async () => {
    start();
    act(() => switchAccount("A1"));
    goTo("s04");
    fireEvent.click(inFrame().getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wróć do prototypu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(current()).toBe("s04");
  });

  it("zamknięty baner nie wraca przez 7 dni, a po 7 dniach wraca", () => {
    start();
    act(() => switchAccount("A2"));
    goTo("s04");
    fireEvent.click(inFrame().getByRole("button", { name: "Zamknij" }));
    expect(inFrame().queryByText("Potwierdź adres e-mail")).toBeNull();
    act(() => advanceClock(6 * 24 * 3_600_000));
    expect(inFrame().queryByText("Potwierdź adres e-mail")).toBeNull();
    act(() => advanceClock(24 * 3_600_000));
    expect(inFrame().getByText("Potwierdź adres e-mail")).toBeTruthy();
  });

  it("zaproszenie: niezalogowany zakłada konto i wraca na s07, a zalogowany dołącza bez opcji gościa", async () => {
    start();
    goTo("s07");
    expect(inFrame().getByRole("button", { name: "Graj jako gość" })).toBeTruthy();
    fireEvent.click(inFrame().getByRole("button", { name: "Załóż konto" }));
    expect(current()).toBe("s01");
    type("E-mail", "kuba@example.com");
    type("Nazwa gracza", "Kuba_P");
    type("Hasło", "osiem-zn");
    fireEvent.click(within(frame().querySelector("form")!).getByRole("button", { name: "Załóż konto" }));
    await waitFor(() => expect(current()).toBe("s07"));
    expect(inFrame().getByRole("button", { name: "Dołącz do partii" })).toBeTruthy();
    expect(inFrame().queryByRole("button", { name: "Graj jako gość" })).toBeNull();
  });

  it("hasło ma co najmniej 8 znaków", async () => {
    start();
    type("E-mail", "kuba@example.com");
    type("Nazwa gracza", "Kuba_P");
    type("Hasło", "siedem7");
    fireEvent.click(within(frame().querySelector("form")!).getByRole("button", { name: "Załóż konto" }));
    await waitFor(() => expect(inFrame().getByText("Hasło musi mieć co najmniej 8 znaków.")).toBeTruthy());
    expect(current()).toBe("s01");
  });

  it("gość po ostrzeżeniu dostaje partię i nie może się zalogować ani zarejestrować", async () => {
    start();
    goTo("s07");
    fireEvent.click(inFrame().getByRole("button", { name: "Graj jako gość" }));
    fireEvent.click(inFrame().getByRole("button", { name: "Rozumiem, graj jako gość" }));
    await waitFor(() => expect(getSim().guestGame).toBe(true));
    goTo("s02");
    expect(inFrame().getByText("Trwa Twoja partia jako gość")).toBeTruthy();
    goTo("s01");
    expect(inFrame().getByText("Trwa Twoja partia jako gość")).toBeTruthy();
  });

  it("niepotwierdzone konto bez partii znika po 14 dniach, a konto z partią zostaje", () => {
    start();
    act(() => switchAccount("A2"));
    act(() => advanceClock(13 * 24 * 3_600_000));
    expect(getSim().accounts["kuba@example.com"]).toBeTruthy();
    expect(accountExists(getSim(), "kuba@example.com")).toBeTruthy();
    act(() => advanceClock(24 * 3_600_000));
    expect(accountExists(getSim(), "kuba@example.com")).toBeNull();
    act(() => resetSim());
    act(() => switchAccount("A2"));
    act(() => giveAccountAGame());
    act(() => advanceClock(30 * 24 * 3_600_000));
    expect(accountExists(getSim(), "kuba@example.com")).toBeTruthy();
  });

  it("przycisk Back wraca do poprzedniego ekranu", () => {
    start();
    goTo("s04");
    goTo("s06");
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(current()).toBe("s04");
  });

  it("Reset wraca do s01 i czyści konto", async () => {
    start();
    act(() => switchAccount("A2"));
    goTo("s04");
    fireEvent.click(screen.getByRole("button", { name: "Reset symulacji" }));
    await waitFor(() => expect(current()).toBe("s01"));
    expect(getSim().session).toBeNull();
  });
});
