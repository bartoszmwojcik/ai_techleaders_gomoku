import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HistoryLoading from "./loading";

describe("HistoryLoading", () => {
  it("shows the shape of the page while the history is read", () => {
    const html = renderToStaticMarkup(<HistoryLoading />);

    expect(html).toContain("Historia partii");
    expect(html).toContain("Ładowanie historii partii");
  });
});
