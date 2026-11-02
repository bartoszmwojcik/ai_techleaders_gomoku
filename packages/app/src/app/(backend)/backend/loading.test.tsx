import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import BackendLoading from "./loading";

it("announces the loading state without any data", () => {
  const html = renderToStaticMarkup(<BackendLoading />);
  expect(html).toContain('role="status"');
  expect(html).toContain("Ładowanie…");
});
