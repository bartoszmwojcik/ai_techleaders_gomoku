import {
  CSP_NONCE_REQUEST_HEADER,
  createCspNonce,
  pageContentSecurityPolicy,
} from "@gomoku/core/http/content-security-policy";
import { LANG_COOKIE, LANG_QUERY_PARAM, isLocale, langCookieAttributes } from "@gomoku/core/i18n/locales";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next reads `config` statically, so every value is a literal (the `lang` key is checked against `LANG_QUERY_PARAM` in
 * the test). Two jobs, two matchers:
 * - `?lang=` on a player page (spec I5): never for the API, Next's assets, the admin panel or files with an extension.
 *   Next's `has` needs a non-empty value, so an empty `?lang=` (or a bare `?lang`) never reaches this rule and stays in
 *   the address; it selects nothing, so the page renders as without it.
 * - The Content Security Policy of every page, the admin panel included (the Next 16 guide: a nonce per request). The
 *   API and Next's assets get a fixed policy from `next.config.ts`; prefetches render no document and are skipped.
 */
export const config = {
  matcher: [
    {
      source: "/((?!api|_next|backend|.*\\..*).*)",
      has: [{ type: "query", key: "lang" }],
    },
    {
      source: "/((?!api|_next|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export function proxy(request: NextRequest): NextResponse {
  // The admin panel also reaches the proxy now (for its CSP), but `?lang=` there stays as it was: not handled.
  if (request.nextUrl.searchParams.get(LANG_QUERY_PARAM) && !request.nextUrl.pathname.startsWith("/backend")) {
    return languageRedirect(request);
  }
  return withContentSecurityPolicy(request);
}

/**
 * `?lang=fr` stores the choice in the language cookie and answers 307 to the same address without `lang`, keeping the
 * other parameters (`?projektor=1`), so the bar and bookmarks keep a clean address. An unsupported value is only
 * dropped. The first `lang` decides; all of them are removed.
 */
function languageRedirect(request: NextRequest): NextResponse {
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

/**
 * A fresh nonce per page request. Next reads the nonce from the request's `Content-Security-Policy` header and puts it
 * on its own scripts; the layout reads `x-nonce` for the inline theme script. Every page is rendered per request (the
 * layouts read cookies), so no prerendered HTML is served without the nonce.
 */
function withContentSecurityPolicy(request: NextRequest): NextResponse {
  const nonce = createCspNonce();
  const policy = pageContentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_NONCE_REQUEST_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}
