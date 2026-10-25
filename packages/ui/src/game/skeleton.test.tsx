import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Skeleton, SkeletonRegion } from "./skeleton";

describe("Skeleton", () => {
  it("is a hidden block that stops pulsing under reduced motion", () => {
    const html = renderToStaticMarkup(<Skeleton className="h-6 w-full" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("h-6 w-full");
  });
});

describe("SkeletonRegion", () => {
  it("announces loading once and marks the region busy", () => {
    const html = renderToStaticMarkup(
      <SkeletonRegion label="Ładowanie listy partii" className="p-4">
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
      </SkeletonRegion>,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Ładowanie listy partii");
    expect(html).toContain("sr-only");
    expect(html.match(/animate-pulse/g)).toHaveLength(2);
    expect(html).toContain("p-4");
  });
});
