// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, push } = vi.hoisted(() => ({ apiCall: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import enShow from "@/i18n/catalogs/en/show";
import type { ShowOverview } from "@/server/services/games/show-service";

import { ShowConsole } from "./show-console";

const RUNNING = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

const overview = (over: Partial<ShowOverview> = {}): ShowOverview => ({
  enabled: true,
  botVsBotEnabled: true,
  level2Enabled: false,
  preflight: { ok: true, checks: [] },
  current: null,
  ...over,
});

beforeEach(() => {
  apiCall.mockReset();
  push.mockReset();
});
afterEach(cleanup);

const start = () => screen.getByRole("button", { name: "Rozpocznij pokaz" });

describe("ShowConsole, state 1: switched off", () => {
  it("says the show is off and what turns it on, without a form", () => {
    render(<ShowConsole initial={overview({ enabled: false })} />);

    expect(screen.getByText("Pokaz jest wyłączony")).toBeTruthy();
    expect(screen.getByText(/SHOW_ENABLED=true/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ShowConsole, state 3: the form", () => {
  it("offers level 1 only, with the reason, while level 2 in bot vs bot is off", () => {
    render(<ShowConsole initial={overview()} />);

    const seat1 = screen.getByLabelText("Bot na miejscu 1") as HTMLSelectElement;
    expect([...seat1.options].map((option) => option.textContent)).toEqual(["Poziom 1"]);
    expect(screen.getAllByText("Poziom 2 w bot vs bot czeka na strojenie tempa i pomiar na serwerze.")).toHaveLength(2);
    expect((start() as HTMLButtonElement).disabled).toBe(false);
  });

  it("creates the chosen show and goes to its view", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g-new", layout: "bot-bot", bots: [] } });
    render(<ShowConsole initial={overview({ level2Enabled: true })} />);

    await userEvent.selectOptions(screen.getByLabelText("Bot na miejscu 2"), "2");
    await userEvent.click(start());

    expect(apiCall).toHaveBeenCalledWith("/api/show", { body: { layout: "bot-bot", levels: [1, 2] } });
    expect(push).toHaveBeenCalledWith("/show/g-new");
    expect(screen.queryByText("Poziom 2 w bot vs bot czeka na strojenie tempa i pomiar na serwerze.")).toBeNull();
  });

  it("sends one creation for a double click", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ShowConsole initial={overview()} />);

    await act(async () => {
      start().click();
      start().click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: { gameId: "g-new" } }));
  });

  it("shows a refusal as an alert with its code and moves the focus to the heading", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "BOT_UNAVAILABLE", message: "x", data: { reason: "busy" } } });
    render(<ShowConsole initial={overview()} />);

    await userEvent.click(start());

    const alert = within(screen.getByTestId("show-error")).getByRole("alert");
    expect(alert.textContent).toContain("Nie udało się rozpocząć pokazu");
    expect(alert.textContent).toContain("Wszystkie miejsca na partie z botem są zajęte (BOT_MAX_ACTIVE_GAMES).");
    expect(alert.textContent).toContain("Kod błędu: BOT_UNAVAILABLE");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect((start() as HTMLButtonElement).disabled).toBe(false);
  });

  it("turns SHOW_RUNNING into the card of the show in progress", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "SHOW_RUNNING", message: "x", data: { gameId: RUNNING } } });
    render(<ShowConsole initial={overview()} />);

    await userEvent.click(start());

    expect(screen.getByRole("link", { name: "Wróć do pokazu" }).getAttribute("href")).toBe(`/show/${RUNNING}`);
    expect((start() as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the form when SHOW_RUNNING comes without a game id", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "SHOW_RUNNING", message: "x" } });
    render(<ShowConsole initial={overview()} />);

    await userEvent.click(start());

    expect(screen.queryByTestId("show-running")).toBeNull();
    expect(screen.getByTestId("show-error").textContent).toContain("Trwa już pokaz.");
  });

  it("blocks the form with the reason while bot vs bot is switched off", () => {
    render(<ShowConsole initial={overview({ botVsBotEnabled: false })} />);

    expect(screen.getByText("Układ bot vs bot jest wyłączony: ustaw SHOW_BOT_VS_BOT_ENABLED=true.")).toBeTruthy();
    expect((start() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Bot na miejscu 1") as HTMLSelectElement).disabled).toBe(true);
  });

  it("speaks the language the server passed", () => {
    render(<ShowConsole initial={overview()} locale="en" dict={enShow} />);

    expect(screen.getByRole("button", { name: "Start the show" })).toBeTruthy();
    expect(screen.getByLabelText("Bot in seat 1")).toBeTruthy();
  });
});

describe("ShowConsole, will the show start", () => {
  it("lists every check with its state and numbers, for the chosen levels", async () => {
    apiCall.mockResolvedValue({
      ok: true,
      data: {
        ok: false,
        checks: [
          { id: "show_enabled", ok: true },
          { id: "memory", ok: false, detail: { availableMb: 200, minAvailableMb: 256 } },
          { id: "slot", ok: true, detail: { activeGames: 1, maxActiveGames: 3 } },
          { id: "engine", ok: null },
        ],
      },
    });
    render(<ShowConsole initial={overview()} />);

    await userEvent.click(screen.getByRole("button", { name: "Sprawdź, czy pokaz wystartuje" }));

    expect(apiCall).toHaveBeenCalledWith("/api/show/preflight", { body: { layout: "bot-bot", levels: [1, 1] } });
    expect(screen.getByText("Pokaz nie wystartuje: popraw pozycje oznaczone jako niespełnione.")).toBeTruthy();
    const items = within(screen.getByRole("list", { name: "Wynik sprawdzenia" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Pokaz włączony (SHOW_ENABLED)spełnione",
      "Pamięć: dostępne 200 MB, potrzeba co najmniej 256 MBniespełnione",
      "Partie z botem w toku: 1 z 3spełnione",
      "Silnik bota (próbny ruch sprawdzi kolejna wersja)niesprawdzone",
    ]);
  });

  it("says the show will start, and copes with checks without numbers", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { ok: true, checks: [{ id: "memory", ok: true }, { id: "slot", ok: true }] } });
    render(<ShowConsole initial={overview()} />);

    await userEvent.click(screen.getByRole("button", { name: "Sprawdź, czy pokaz wystartuje" }));

    expect(screen.getByText("Pokaz wystartuje.")).toBeTruthy();
    expect(screen.getByText("Pamięć: dostępne 0 MB, potrzeba co najmniej 0 MB")).toBeTruthy();
    expect(screen.getByText("Partie z botem w toku: 0 z 0")).toBeTruthy();
  });

  it("says when the check itself failed", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "network", message: "x" } });
    render(<ShowConsole initial={overview()} />);

    await userEvent.click(screen.getByRole("button", { name: "Sprawdź, czy pokaz wystartuje" }));

    expect(screen.getByRole("alert").textContent).toContain("Nie udało się sprawdzić. Spróbuj ponownie.");
  });
});

describe("ShowConsole, state 2: a show in progress", () => {
  const running = () => overview({ current: { gameId: RUNNING, status: "active", layout: "bot-bot" } });

  it("shows the card with the way back and blocks the form with the reason", () => {
    render(<ShowConsole initial={running()} />);

    const card = screen.getByRole("region", { name: "Trwa pokaz" });
    expect(card.textContent).toContain("Układ: Bot vs bot");
    expect(card.textContent).toContain("Stan: w toku");
    expect(within(card).getByRole("link", { name: "Wróć do pokazu" }).getAttribute("href")).toBe(`/show/${RUNNING}`);
    expect((start() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Nowy pokaz rozpoczniesz, gdy ten się zakończy.")).toBeTruthy();
  });

  it("ends the show after confirmation and frees the form", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
    render(<ShowConsole initial={running()} />);

    await userEvent.click(screen.getByRole("button", { name: "Zakończ pokaz" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Zakończ pokaz" }));

    expect(apiCall).toHaveBeenCalledWith(`/api/show/${RUNNING}/end`);
    expect(screen.queryByRole("region", { name: "Trwa pokaz" })).toBeNull();
    expect((start() as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the card and says so when ending failed; a double confirmation sends one request", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ShowConsole initial={overview({ current: { gameId: RUNNING, status: "waiting", layout: "bot-agent" } })} />);
    expect(screen.getByText("Stan: czeka na agenta")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Zakończ pokaz" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Zakończ pokaz" });
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: false, error: { code: "network", message: "x" } }));

    expect(screen.getByRole("alert").textContent).toContain("Nie udało się zakończyć pokazu.");
    expect(screen.getByRole("region", { name: "Trwa pokaz" })).toBeTruthy();
  });
});
