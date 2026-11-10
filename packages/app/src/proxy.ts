import { LANG_COOKIE, LANG_QUERY_PARAM, isLocale, langCookieAttributes } from "@gomoku/core/i18n/locales";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs only for player pages whose address has `lang` (spec I5): never for the API, Next's assets, the admin panel or
 * files with an extension, and never for a request without the parameter, so every other request costs nothing.
 * Next reads `config` statically, so the key is a literal (`LANG_QUERY_PARAM`, checked in the test).
 */
export const config = {
  matcher: [
    {
      source: "/((?!api|_next|backend|.*\\..*).*)",
      has: [{ type: "query", key: "lang" }],
    },
  ],
};

/**
 * `?lang=fr` stores the choice in the language cookie and answers 307 to the same address without `lang`, keeping the
 * other parameters (`?projektor=1`), so the bar and bookmarks keep a clean address. An unsupported value is only
 * dropped. The first `lang` decides; all of them are removed.
 */
export function proxy(request: NextRequest): NextResponse {
  const params = new URLSearchParams(request.nextUrl.search);
  const lang = params.get(LANG_QUERY_PARAM);
  params.delete(LANG_QUERY_PARAM);
  // One leading slash only: `//evil.example?lang=fr` must not become a protocol-relative address of another host.
  const target = new URL(`/${request.nextUrl.pathname.replace(/^[/\\]+/, "")}`, request.nextUrl);
  target.search = params.toString();
  // Next requires an absolute Location in a proxy and relativises a same-origin one before it is sent, so an internal
  // origin behind the reverse proxy never reaches the browser.
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Cache-Control", "no-store");
  if (isLocale(lang)) {
    // The same rule as the session cookie: Secure unless the integration tests switch it off over plain HTTP.
    const secure = process.env.SESSION_COOKIE_SECURE !== "false";
    response.cookies.set(LANG_COOKIE, lang, langCookieAttributes({ secure }));
  }
  return response;
}
