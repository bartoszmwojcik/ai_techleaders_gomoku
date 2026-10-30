// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle";

function clearCookie() {
  document.cookie = "gomoku_theme=; Path=/; Max-Age=0";
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  clearCookie();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("renders the server snapshot from the cookie theme", () => {
    expect(renderToStaticMarkup(<ThemeToggle initialTheme="light" />)).toContain("Jasny motyw");
    expect(renderToStaticMarkup(<ThemeToggle initialTheme="dark" />)).toContain("Ciemny motyw");
    expect(renderToStaticMarkup(<ThemeToggle initialTheme={null} />)).toContain("Ciemny motyw");
  });

  it("reads the theme set on <html> after hydration", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle initialTheme={null} />);

    expect(screen.getByRole("button", { name: "Jasny motyw" })).toBeTruthy();
  });

  it("falls back to dark for an unknown attribute value", () => {
    document.documentElement.dataset.theme = "blue";
    render(<ThemeToggle initialTheme="dark" />);

    expect(screen.getByRole("button", { name: "Ciemny motyw" })).toBeTruthy();
  });

  it("switches to light, stores the cookie and keeps focus on the button", async () => {
    render(<ThemeToggle initialTheme="dark" className="ml-auto" />);
    const button = screen.getByRole("button", { name: "Ciemny motyw" });

    await userEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("gomoku_theme=light");
    await waitFor(() => expect(screen.getByRole("button", { name: "Jasny motyw" })).toBe(button));
    expect(document.activeElement).toBe(button);
    expect(button.className).toContain("ml-auto");
  });

  it("switches back to dark on the second click", async () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle initialTheme="light" />);
    const button = screen.getByRole("button");

    await userEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("gomoku_theme=dark");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ciemny motyw" })).toBe(button));
  });

  it("marks the cookie Secure on https", async () => {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => void writes.push(value));
    vi.stubGlobal("location", { protocol: "https:" });
    render(<ThemeToggle initialTheme="dark" />);

    await userEvent.click(screen.getByRole("button"));

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("gomoku_theme=light");
    expect(writes[0]).toContain("Secure");
    vi.unstubAllGlobals();
  });

  it("does not mark the cookie Secure on http", async () => {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => void writes.push(value));
    render(<ThemeToggle initialTheme="dark" />);

    await userEvent.click(screen.getByRole("button"));

    expect(writes[0]).not.toContain("Secure");
  });

  it("still switches the theme when writing the cookie throws", async () => {
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ThemeToggle initialTheme="dark" />);

    await userEvent.click(screen.getByRole("button"));

    expect(document.documentElement.dataset.theme).toBe("light");
    await waitFor(() => expect(screen.getByRole("button", { name: "Jasny motyw" })).toBeTruthy());
  });
});
