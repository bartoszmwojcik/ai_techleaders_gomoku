// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fr from "@/i18n/catalogs/fr/header";

const navigation = vi.hoisted(() => ({
  pathname: "/show/abc" as string | null,
  search: new URLSearchParams("projektor=1") as URLSearchParams | null,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.search,
}));

import { LanguageSwitch } from "./language-switch";

beforeEach(() => {
  navigation.pathname = "/show/abc";
  navigation.search = new URLSearchParams("projektor=1");
});
afterEach(cleanup);

async function open(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("LanguageSwitch", () => {
  it("shows the current code and names the language in Polish by default", () => {
    const html = renderToStaticMarkup(<LanguageSwitch />);

    expect(html).toContain('aria-label="Język: Polski, zmień język"');
    expect(html).toContain(">PL<");
    expect(html).toContain('data-testid="language-switch"');
  });

  it("lists the reviewed languages as endonym links to the same page, keeping the other parameters", async () => {
    render(<LanguageSwitch locale="fr" dict={fr} />);
    await open("Langue : Français, changer de langue");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Polski", "English", "Français"]);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/show/abc?projektor=1&lang=pl",
      "/show/abc?projektor=1&lang=en",
      "/show/abc?projektor=1&lang=fr",
    ]);
    expect(items.map((item) => item.getAttribute("lang"))).toEqual(["pl", "en", "fr"]);
    expect(items.map((item) => item.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    expect(items[2]!.className).toContain("font-strong");
    expect(items[0]!.className).not.toContain("font-strong");
  });

  it("works from the keyboard", async () => {
    render(<LanguageSwitch />);
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
  });

  it("points at the home page outside the App Router", async () => {
    navigation.pathname = null;
    navigation.search = null;
    render(<LanguageSwitch />);
    await open("Język: Polski, zmień język");

    expect(screen.getByRole("menuitem", { name: "English" }).getAttribute("href")).toBe("/?lang=en");
  });
});
