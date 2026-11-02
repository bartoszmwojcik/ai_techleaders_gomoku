import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { connection } = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("./confirm-email-change", () => ({
  ConfirmEmailChange: ({ token }: { token: string | undefined }) => <div data-token={String(token)} />,
}));

import ConfirmEmailChangePage from "./page";

describe("ConfirmEmailChangePage", () => {
  it("is dynamic and hands the token from the address to the component", async () => {
    const html = renderToStaticMarkup(await ConfirmEmailChangePage({ searchParams: Promise.resolve({ token: "raw" }) }));
    expect(connection).toHaveBeenCalledOnce();
    expect(html).toContain('data-token="raw"');
  });

  it("takes the first of repeated tokens and treats an empty one as missing", async () => {
    expect(renderToStaticMarkup(await ConfirmEmailChangePage({ searchParams: Promise.resolve({ token: ["a", "b"] }) }))).toContain('data-token="a"');
    expect(renderToStaticMarkup(await ConfirmEmailChangePage({ searchParams: Promise.resolve({ token: "" }) }))).toContain('data-token="undefined"');
    expect(renderToStaticMarkup(await ConfirmEmailChangePage({ searchParams: Promise.resolve({}) }))).toContain('data-token="undefined"');
  });
});
