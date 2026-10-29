// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeSwitch } from "./theme-switch";

afterEach(cleanup);

describe("ThemeSwitch", () => {
  it("is not pressed in the dark theme and shows the moon", () => {
    const html = renderToStaticMarkup(<ThemeSwitch theme="dark" onToggle={() => undefined} label="Jasny motyw" />);

    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('type="button"');
    expect(html).toContain("lucide-moon");
    expect(html).toContain("Jasny motyw");
    expect(html).toContain("min-h-target");
    expect(html).toContain("focus-visible:focus-ring");
  });

  it("is pressed in the light theme and shows the sun", () => {
    const html = renderToStaticMarkup(<ThemeSwitch theme="light" onToggle={() => undefined} label="Jasny motyw" />);

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("lucide-sun");
  });

  it("hides the icon from assistive technology and keeps the name constant", () => {
    render(<ThemeSwitch theme="light" onToggle={() => undefined} label="Jasny motyw" />);

    expect(screen.getByRole("button", { name: "Jasny motyw" }).querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("calls onToggle on click and merges extra props", async () => {
    const onToggle = vi.fn();
    render(<ThemeSwitch theme="dark" onToggle={onToggle} label="Jasny motyw" className="ml-auto" data-testid="sw" />);
    const button = screen.getByTestId("sw");

    await userEvent.click(button);

    expect(onToggle).toHaveBeenCalledOnce();
    expect(button.className).toContain("ml-auto");
  });
});
