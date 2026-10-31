// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LobbyList, LobbyRow } from "./lobby-list";

afterEach(cleanup);

describe("LobbyList and LobbyRow", () => {
  it("lists the players with their time left and a button named after the player", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <LobbyList label="Gracze szukający gry" className="max-w-xl">
        <LobbyRow
          name="Alicja_99"
          since="szuka od 1 min"
          expiresLabel="wygasa za"
          expiresInMs={242_000}
          selectLabel="Zagraj"
          selectAriaLabel="Zagraj z Alicja_99"
          onSelect={onSelect}
        />
        <LobbyRow
          name="czarny_kamień"
          expiresLabel="wygasa za"
          expiresInMs={48_000}
          selectLabel="Zagraj"
          selectAriaLabel="Zagraj z czarny_kamień"
          onSelect={() => undefined}
          className="py-4"
        />
      </LobbyList>,
    );

    const list = screen.getByRole("list", { name: "Gracze szukający gry" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("4:02")).toBeTruthy();
    expect(screen.getByText("szuka od 1 min")).toBeTruthy();
    expect(screen.getByText("0:48")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Zagraj z Alicja_99" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows a read-only row without a pick button (E03-S01)", () => {
    render(
      <LobbyList label="Gracze szukający gry">
        <LobbyRow name="Alicja_99" since="szuka od 1 min" expiresLabel="wygasa za" expiresInMs={242_000} />
      </LobbyList>,
    );

    expect(screen.getByText("Alicja_99")).toBeTruthy();
    expect(screen.getByText("4:02")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("blocks a second pick while choosing", () => {
    render(
      <LobbyList label="Gracze">
        <LobbyRow
          name="Alicja_99"
          expiresLabel="wygasa za"
          expiresInMs={100_000}
          selectLabel="Zagraj"
          selectAriaLabel="Zagraj z Alicja_99"
          selecting
          onSelect={() => undefined}
        />
      </LobbyList>,
    );

    const button = screen.getByRole("button", { name: "Zagraj z Alicja_99" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("locks the button of a row while another row is being picked, without a busy state", () => {
    render(
      <LobbyList label="Gracze">
        <LobbyRow
          name="Alicja_99"
          expiresLabel="wygasa za"
          expiresInMs={100_000}
          selectLabel="Zagraj"
          selectAriaLabel="Zagraj z Alicja_99"
          selectDisabled
          onSelect={() => undefined}
        />
      </LobbyList>,
    );

    const button = screen.getByRole("button", { name: "Zagraj z Alicja_99" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });
});
