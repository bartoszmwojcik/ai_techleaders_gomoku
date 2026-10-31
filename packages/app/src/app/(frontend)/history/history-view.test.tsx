// @vitest-environment jsdom
import type { HistoryEntry } from "@gomoku/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { HistoryView } from "./history-view";

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  gameId: "g1",
  finishedAt: "2026-10-31T09:00:00.000Z",
  result: "win",
  reason: "five_in_row",
  opponent: { kind: "account", name: "Alicja_99" },
  ...over,
});
const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string) => ({ ok: false, error: { code, message: "x" } });
const click = (element: HTMLElement) => act(async () => void fireEvent.click(element));
const more = () => screen.getByRole("button", { name: "Pokaż starsze" });

beforeEach(() => {
  apiCall.mockReset();
});
afterEach(cleanup);

describe("HistoryView: the list", () => {
  it("shows the opponent, the result in a word, the date in Warsaw time and how it ended", () => {
    render(<HistoryView initial={{ entries: [entry()], nextCursor: null }} />);

    expect(screen.getByRole("heading", { name: "Historia partii" })).toBeTruthy();
    const row = within(screen.getByRole("list", { name: "Zakończone partie" })).getAllByRole("listitem")[0]!;
    expect(row.textContent).toContain("Alicja_99");
    expect(row.textContent).toContain("31 października 2026, 10:00 CET");
    expect(row.textContent).toContain("5 w linii");
    expect(row.textContent).toContain("Wygrana");
    expect(screen.queryByRole("button", { name: "Pokaż starsze" })).toBeNull();
    expect(screen.getByRole("link", { name: "Wróć na stronę główną" })).toBeTruthy();
  });

  it("names a guest with the suffix, a deleted account and an agent, and says loss and draw", () => {
    render(
      <HistoryView
        initial={{
          entries: [
            entry({ gameId: "a", result: "loss", reason: "timeout", opponent: { kind: "guest", name: "Kasia" } }),
            entry({ gameId: "b", result: "draw", reason: "draw", opponent: { kind: "account", name: null } }),
            entry({ gameId: "c", reason: "resignation", opponent: { kind: "agent", name: null } }),
            entry({ gameId: "d", opponent: { kind: "agent", name: "claude opus 5.5" } }),
          ],
          nextCursor: null,
        }}
      />,
    );

    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows[0]).toContain("Kasia (gość)");
    expect(rows[0]).toContain("Porażka");
    expect(rows[0]).toContain("Koniec czasu");
    expect(rows[1]).toContain("Usunięty gracz");
    expect(rows[1]).toContain("Remis");
    expect(rows[1]).toContain("Plansza pełna");
    expect(rows[2]).toContain("Agent");
    expect(rows[2]).toContain("Poddanie");
    expect(rows[2]).not.toContain("deklarowane");
    expect(rows[3]).toContain("Agent · claude opus 5.5 (deklarowane)");
  });

  it("keeps the whole name of a guest with a 24-character nickname in the title", () => {
    const nick = "Bardzo_Dlugi_Nick_Goscia";
    render(<HistoryView initial={{ entries: [entry({ opponent: { kind: "guest", name: nick } })], nextCursor: null }} />);

    expect(screen.getByTestId("player-name").getAttribute("title")).toBe(`${nick} (gość)`);
  });

  it("says why it is empty and offers the next step", () => {
    render(<HistoryView initial={{ entries: [], nextCursor: null }} />);

    expect(screen.getByText("Nie rozegrałeś jeszcze żadnej partii")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Utwórz zaproszenie" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Zakończone partie" })).toBeNull();
  });
});

describe("HistoryView: older games", () => {
  it("asks for the next page with the cursor, appends it and announces how many came", async () => {
    apiCall.mockResolvedValue(
      ok({ entries: [entry({ gameId: "g2", opponent: { kind: "account", name: "Bartek" } })], nextCursor: null }),
    );
    render(<HistoryView initial={{ entries: [entry()], nextCursor: "a+b/c" }} />);

    await click(more());

    expect(apiCall).toHaveBeenCalledExactlyOnceWith("/api/history?cursor=a%2Bb%2Fc", { method: "GET" });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Bartek")).toBeTruthy();
    expect(screen.getByTestId("history-added").textContent).toBe("Dodano 1 starszych partii.");
    expect(screen.queryByRole("button", { name: "Pokaż starsze" })).toBeNull();
  });

  it("keeps the button while there is a next page", async () => {
    apiCall.mockResolvedValue(ok({ entries: [entry({ gameId: "g2" })], nextCursor: "next" }));
    render(<HistoryView initial={{ entries: [entry()], nextCursor: "first" }} />);

    await click(more());

    expect(more()).toBeTruthy();
  });

  it("sends one request for a double click", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<HistoryView initial={{ entries: [entry()], nextCursor: "first" }} />);

    await act(async () => {
      fireEvent.click(more());
      fireEvent.click(more());
    });
    expect(apiCall).toHaveBeenCalledOnce();

    await act(async () => finish(ok({ entries: [], nextCursor: null })));
  });

  it("says it failed, keeps the rows and retries the same cursor", async () => {
    apiCall.mockResolvedValueOnce(fail("network")).mockResolvedValueOnce(ok({ entries: [entry({ gameId: "g2" })], nextCursor: null }));
    render(<HistoryView initial={{ entries: [entry()], nextCursor: "first" }} />);

    await click(more());

    expect(screen.getByText("Nie udało się wczytać starszych partii")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    await click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(apiCall).toHaveBeenNthCalledWith(2, "/api/history?cursor=first", { method: "GET" });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Nie udało się wczytać starszych partii")).toBeNull();
  });

  it("sends an expired session to the login with a way back", async () => {
    apiCall.mockResolvedValue(fail("UNAUTHORIZED"));
    render(<HistoryView initial={{ entries: [entry()], nextCursor: "first" }} />);

    await click(more());

    expect(screen.getByRole("link", { name: "Zaloguj się ponownie" }).getAttribute("href")).toBe("/login?next=%2Fhistory");
  });
});
