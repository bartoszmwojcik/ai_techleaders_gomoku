// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GameError from "./error";

afterEach(cleanup);

describe("GameError", () => {
  it("re-fetches the segment with retry() (Next 16), not with reset()", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(<GameError error={new Error("x")} retry={retry} {...({ reset } as object)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
});
