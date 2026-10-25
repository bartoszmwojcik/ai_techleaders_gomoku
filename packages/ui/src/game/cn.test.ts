import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("keeps a token text size next to a token text colour", () => {
    expect(cn("text-body text-text-primary")).toBe("text-body text-text-primary");
  });

  it("lets a later token size or weight replace an earlier one", () => {
    expect(cn("text-body font-regular", "text-title font-strong")).toBe("text-title font-strong");
  });

  it("lets a later token radius or shadow replace an earlier one", () => {
    expect(cn("rounded-base shadow-board", "rounded-piece shadow-piece")).toBe("rounded-piece shadow-piece");
  });

  it("drops falsy values and merges a later colour over an earlier one", () => {
    expect(cn("bg-surface-page", false, undefined, "bg-surface-raised")).toBe("bg-surface-raised");
  });
});
