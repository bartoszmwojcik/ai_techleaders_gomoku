import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./join-form", () => ({ JoinForm: () => <form data-testid="join-form" /> }));

import JoinPage from "./page";

describe("JoinPage", () => {
  it("asks for the code and leads back home", () => {
    const html = renderToStaticMarkup(<JoinPage />);
    expect(html).toContain("Masz kod zaproszenia?</h1>");
    expect(html).toContain('data-testid="join-form"');
    expect(html).toContain('href="/"');
    expect(html).toContain("Wróć na stronę główną");
  });
});
