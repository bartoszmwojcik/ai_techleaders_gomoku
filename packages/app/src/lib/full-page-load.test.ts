import { afterEach, describe, expect, it, vi } from "vitest";

import { fullPageLoad } from "./full-page-load";

afterEach(() => vi.unstubAllGlobals());

describe("fullPageLoad", () => {
  it("assigns the absolute address of the path, query included", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign, origin: "https://gomoku.example" } });

    fullPageLoad("/login?next=%2Faccount");

    expect(assign).toHaveBeenCalledExactlyOnceWith("https://gomoku.example/login?next=%2Faccount");
  });
});
