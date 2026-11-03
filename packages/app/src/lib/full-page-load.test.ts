import { afterEach, describe, expect, it, vi } from "vitest";

import { fullPageLoad } from "./full-page-load";

afterEach(() => vi.unstubAllGlobals());

describe("fullPageLoad", () => {
  it("replaces the entry with the absolute address of the path, query included", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace, origin: "https://gomoku.example" } });

    fullPageLoad("/login?next=%2Faccount");

    expect(replace).toHaveBeenCalledExactlyOnceWith("https://gomoku.example/login?next=%2Faccount");
  });
});
