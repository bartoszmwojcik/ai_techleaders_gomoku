import { LOCALES, SWITCHER_LOCALES, type Locale } from "@gomoku/core/i18n/locales";
import { describe, expect, it, vi } from "vitest";

import { LOADERS, loadNamespace } from "./index";
import { CATALOG_STATUS } from "./status";
import { NAMESPACES } from "./types";

/**
 * Languages in the switch whatever their review status: the approved decision of `.ai/specs/2026-11-10-i18n.md`
 * (a draft is shown, `reviewed` declares the quality). Changing this set needs the owner's decision.
 */
const ALWAYS_IN_SWITCHER: readonly Locale[] = ["pl", "en", "fr"];

const GATED = LOCALES.filter((locale) => !ALWAYS_IN_SWITCHER.includes(locale)) as Exclude<Locale, "pl" | "en" | "fr">[];

function fullyReviewed(locale: Exclude<Locale, "pl">): boolean {
  return Object.values(CATALOG_STATUS[locale]).every((status) => status.state === "reviewed");
}

// Spec E15 completion, phase 6 (F6.2): the language switch follows the review status.
describe("language switch gate", () => {
  it("keeps Polish, English and French in the switch regardless of their review status", () => {
    for (const locale of ALWAYS_IN_SWITCHER) expect(SWITCHER_LOCALES, locale).toContain(locale);
  });

  it.each(GATED)("offers %s in the switch only once every namespace is reviewed", (locale) => {
    expect(SWITCHER_LOCALES.includes(locale), locale).toBe(fullyReviewed(locale));
  });

  it("keeps German, a draft today, out of the switch", () => {
    expect(GATED).toEqual(["de"]);
    expect(fullyReviewed("de")).toBe(false);
    expect(SWITCHER_LOCALES).not.toContain("de");
  });

  it.each(NAMESPACES)("serves ?lang=de for %s from the German catalog alone, with no English fallback", async (namespace) => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const german = (await LOADERS.de[namespace]()).default;

    expect(await loadNamespace("de", namespace)).toEqual(german);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    vi.unstubAllEnvs();
  });
});
