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
  const query = params.toString();
  // A relative Location: behind the TLS-terminating reverse proxy the request URL may carry the internal origin.
  // One leading slash only: `//evil.example?lang=fr` must not turn into a protocol-relative redirect to another host.
  const path = `/${request.nextUrl.pathname.replace(/^[/\\]+/, "")}`;
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: `${path}${query ? `?${query}` : ""}`, "Cache-Control": "no-store" },
  });
  if (isLocale(lang)) {
    // The same rule as the session cookie: Secure unless the integration tests switch it off over plain HTTP.
    const secure = process.env.SESSION_COOKIE_SECURE !== "false";
    response.cookies.set(LANG_COOKIE, lang, langCookieAttributes({ secure }));
  }
  return response;
}
