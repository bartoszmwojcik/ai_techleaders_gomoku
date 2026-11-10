"use client";

import { LOCALE_NAMES, SWITCHER_LOCALES, langSwitchHref, type Locale } from "@gomoku/core/i18n/locales";
import { createTranslator } from "@gomoku/core/i18n/translator";
import { UserMenu, UserMenuLink } from "@gomoku/ui/game/user-menu";
import { usePathname, useSearchParams } from "next/navigation";

import plHeader from "@/i18n/catalogs/pl/header";
import type { NamespaceDict } from "@/i18n/catalogs/types";

type LanguageSwitchProps = {
  /** The language of this page, resolved on the server. */
  locale?: Locale;
  /** The `header` namespace from the server; Polish by default. */
  dict?: NamespaceDict<"header">;
};

/**
 * The language menu in the top bar (spec I7): the button shows the current code (`PL`), so it fits the 320 px bar next
 * to the theme switch; the items are plain links to the same page with `?lang=xx`, which the proxy turns into the
 * cookie and a full reload. Names are endonyms with their own `lang`; German stays out until it is reviewed.
 */
export function LanguageSwitch({ locale = "pl", dict = plHeader }: LanguageSwitchProps) {
  const t = createTranslator(locale, dict);
  // Null outside the App Router (a static render in tests): the links then point at the home page.
  const pathname = usePathname() ?? "/";
  const search = useSearchParams()?.toString() ?? "";

  return (
    <UserMenu
      name={locale.toUpperCase()}
      label={t("language.menuLabel", { language: LOCALE_NAMES[locale] })}
      data-testid="language-switch"
    >
      {SWITCHER_LOCALES.map((each) => (
        <UserMenuLink
          key={each}
          href={langSwitchHref(pathname, search, each)}
          lang={each}
          hrefLang={each}
          aria-current={each === locale ? "true" : undefined}
          className={each === locale ? "font-strong" : undefined}
          data-testid={`language-${each}`}
        >
          {LOCALE_NAMES[each]}
        </UserMenuLink>
      ))}
    </UserMenu>
  );
}
