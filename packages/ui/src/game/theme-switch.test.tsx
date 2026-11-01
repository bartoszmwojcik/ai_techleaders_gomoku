// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeSwitch } from "./theme-switch";

afterEach(cleanup);

const labels = { lightLabel: "Jasny motyw", darkLabel: "Ciemny motyw" };

describe("ThemeSwitch", () => {
  it("names the dark theme with the moon while it is on", () => {
    const html = renderToStaticMarkup(<ThemeSwitch theme="dark" onToggle={() => undefined} {...labels} />);

    expect(html).toContain("lucide-moon");
    expect(html).toContain('aria-label="Ciemny motyw"');
    expect(html).toContain('type="button"');
    expect(html).toContain("min-h-target");
    expect(html).toContain("focus-visible:focus-ring");
  });

  it("names the light theme with the sun while it is on", () => {
    const html = renderToStaticMarkup(<ThemeSwitch theme="light" onToggle={() => undefined} {...labels} />);

    expect(html).toContain("lucide-sun");
    expect(html).toContain('aria-label="Jasny motyw"');
  });

  it("shows no visible text: the icon is the whole content and the name is aria-label", () => {
    const html = renderToStaticMarkup(<ThemeSwitch theme="dark" onToggle={() => undefined} {...labels} />);

    expect(html).toContain('aria-label="Ciemny motyw"');
    expect(html.replace(/<svg[\s\S]*?<\/svg>/, "").replace(/<[^>]+>/g, "")).toBe("");
    expect(html).toContain("min-w-target");
  });

  it("exposes only the current theme as the accessible name", () => {
    render(<ThemeSwitch theme="dark" onToggle={() => undefined} {...labels} />);

    expect(screen.getByRole("button", { name: "Ciemny motyw" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Jasny motyw" })).toBeNull();
  });

  it("is a plain button: the name carries the state, so there is no aria-pressed", () => {
    expect(renderToStaticMarkup(<ThemeSwitch theme="dark" onToggle={() => undefined} {...labels} />)).not.toContain("aria-pressed");
    expect(renderToStaticMarkup(<ThemeSwitch theme="light" onToggle={() => undefined} {...labels} />)).not.toContain("aria-pressed");
  });

  it("hides the icon from assistive technology", () => {
    render(<ThemeSwitch theme="light" onToggle={() => undefined} {...labels} />);

    expect(screen.getByRole("button", { name: "Jasny motyw" }).querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("calls onToggle on click and merges extra props", async () => {
    const onToggle = vi.fn();
    render(<ThemeSwitch theme="dark" onToggle={onToggle} {...labels} className="ml-auto" data-testid="sw" />);
    const button = screen.getByTestId("sw");

    await userEvent.click(button);

    expect(onToggle).toHaveBeenCalledOnce();
    expect(button.className).toContain("ml-auto");
  });
});
