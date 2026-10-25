// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeekingStatus } from "./seeking-status";

afterEach(cleanup);

describe("SeekingStatus", () => {
  it("always shows the time left and lets the player withdraw", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();
    render(
      <SeekingStatus
        title="Szukasz gry"
        expiresLabel="Status wygasa za"
        expiresInMs={272_000}
        withdrawLabel="Wycofaj"
        onWithdraw={onWithdraw}
        className="max-w-xl"
      />,
    );

    expect(screen.getByText("Szukasz gry")).toBeTruthy();
    expect(screen.getByText("4:32").className).toContain("tabular-nums");
    expect(screen.getByText(/Status wygasa za/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Wycofaj" }));

    expect(onWithdraw).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
