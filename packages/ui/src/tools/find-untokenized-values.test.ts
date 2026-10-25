import { describe, expect, it } from "vitest";

import { findUntokenizedValues } from "./find-untokenized-values";

describe("findUntokenizedValues", () => {
  it("returns nothing for token-based classes", () => {
    const source = `<div className="bg-surface-page text-text-muted p-panel gap-group rounded-base shadow-board text-body font-strong" />`;

    expect(findUntokenizedValues(source)).toEqual([]);
  });

  it("finds colour literals in hex and functional notation", () => {
    const source = ["const a = '#1c1917';", "const b = 'rgb(0 0 0)';", "const c = 'oklch(0.5 0 0)';"].join("\n");

    expect(findUntokenizedValues(source)).toEqual([
      { line: 1, kind: "color-literal", match: "#1c1917" },
      { line: 2, kind: "color-literal", match: "rgb(" },
      { line: 3, kind: "color-literal", match: "oklch(" },
    ]);
  });

  it("ignores markdown headings and var() colour references", () => {
    expect(findUntokenizedValues("# Kolor\nstyle={{ color: 'var(--text-muted)' }}")).toEqual([]);
  });

  it("finds Tailwind palette classes, also white and black", () => {
    const source = `<p className="bg-zinc-900 text-white hover:border-blue-500 ring-black" />`;

    expect(findUntokenizedValues(source).map(({ match }) => match)).toEqual([
      "bg-zinc-900",
      "text-white",
      "border-blue-500",
      "ring-black",
    ]);
  });

  it("does not mistake token names that end in a palette word", () => {
    expect(findUntokenizedValues(`<i className="bg-piece-white border-piece-outline text-status-danger" />`)).toEqual([]);
  });

  it("finds arbitrary values but allows token-derived ones and variant selectors", () => {
    const source = `<div className="p-[13px] w-[var(--space-12)] data-[state=open]:block aria-[invalid=true]:block grid-cols-[repeat(15,1fr)]" />`;

    expect(findUntokenizedValues(source).map(({ match }) => match)).toEqual(["p-[13px]", "grid-cols-[repeat(15,1fr)]"]);
  });

  it("finds spacing steps off the 4 px grid, also with fractions and negatives", () => {
    const source = `<div className="p-5 md:gap-10 -mt-5 my-0.5 p-4 gap-12 m-0 p-1/2" />`;

    expect(findUntokenizedValues(source).map(({ match }) => match)).toEqual(["p-5", "gap-10", "-mt-5", "my-0.5"]);
  });

  it("finds default Tailwind scales that tokens replace", () => {
    const source = `<b className="rounded-lg rounded-t-md shadow-xl text-sm text-2xl font-bold rounded-none" />`;

    expect(findUntokenizedValues(source).map(({ match }) => match)).toEqual([
      "rounded-lg",
      "rounded-t-md",
      "shadow-xl",
      "text-sm",
      "text-2xl",
      "font-bold",
    ]);
  });

  it("reports the line of each finding", () => {
    const violations = findUntokenizedValues("ok\nok\nbg-red-500");

    expect(violations).toEqual([{ line: 3, kind: "palette-class", match: "bg-red-500" }]);
  });
});
