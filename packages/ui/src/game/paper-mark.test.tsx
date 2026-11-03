import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaperMark } from "./paper-mark";

describe("PaperMark", () => {
  it("draws black as × in full ink and white as ○ with a light fill", () => {
    const cross = renderToStaticMarkup(<PaperMark color="black" />);
    expect(cross).toContain("<path");
    expect(cross).not.toContain("<circle");
    expect(cross).toContain("stroke-paper-ink");
    const circle = renderToStaticMarkup(<PaperMark color="white" />);
    expect(circle).toContain("<circle");
    expect(circle).toContain("fill-paper-mark-fill");
    expect(circle).toContain("stroke-paper-ink");
  });

  it("is decoration without a label and an image with one", () => {
    expect(renderToStaticMarkup(<PaperMark color="black" />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<PaperMark color="black" label="krzyżyk" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="krzyżyk"');
    expect(named).not.toContain("aria-hidden");
  });

  it("marks the automaton with a lighter broken line, the preview with a lighter whole one", () => {
    const auto = renderToStaticMarkup(<PaperMark color="white" auto />);
    expect(auto).toContain("stroke-paper-auto");
    expect(auto).toContain("[stroke-dasharray:var(--paper-mark-dash)]");
    const preview = renderToStaticMarkup(<PaperMark color="white" preview />);
    expect(preview).toContain("stroke-paper-auto");
    expect(preview).not.toContain("stroke-dasharray");
  });

  it("puts the framed mark on a piece of paper, named on the frame", () => {
    const framed = renderToStaticMarkup(<PaperMark color="black" framed label="krzyżyk" className="mr-1" />);
    expect(framed).toContain("bg-paper-surface");
    expect(framed).toContain("mr-1");
    expect(framed.match(/role="img"/g)).toHaveLength(1);
    expect(framed.indexOf('role="img"')).toBeLessThan(framed.indexOf("<svg"));
    expect(framed.slice(framed.indexOf("<svg"))).toContain('aria-hidden="true"');
  });

  it("passes its class to the mark itself when not framed", () => {
    expect(renderToStaticMarkup(<PaperMark color="black" className="size-(--paper-mark-size)" />)).toContain("size-(--paper-mark-size)");
  });
});
