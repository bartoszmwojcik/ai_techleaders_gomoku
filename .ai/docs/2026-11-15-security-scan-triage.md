# Security scan triage — Qualys WAS, gomoku.byst.re (2026-11-10)

- Scan: Qualys WAS, target `https://gomoku.byst.re`, run 2026-11-10, report 2026-11-12 (owner's copy: `Scan Report_eurpe-gomoku.byst.re_20261112.pdf`, not in the repo).
- Triage date: 2026-11-15. The production checks were made against the live site on that day; the "after" checks against a local production build of branch `fix/security-scan-remediation` (`npm run build` + `next start`).
- Topology: the browser talks to Cloudflare (TLS ends there, `server: cloudflare`). Cloudflare sends the request on to the mikr.us proxy (`x-hosted-on: MIKR.US`) and then to the Next.js 16 container on the VPS. Code fixes cover the app's response headers only. TLS, certificates and the shared `byst.re` zone are outside the repository.

## Verdicts

| QID | Finding | Verdict |
| --- | --- | --- |
| 150622 | Suspected path manipulation, `/history` (CWE-22) | FALSE POSITIVE |
| 38794 | TLS 1.1 accepted | INFRA (owner action) |
| 38628 | TLS 1.0 accepted | INFRA (owner action) |
| 150123 | Cookie `gomoku_theme` without HttpOnly | ACCEPTED RISK (by design) |
| 150277 | Cookie `gomoku_theme` without SameSite | FALSE POSITIVE |
| 150319 | Weak cookie `gomoku_theme=dark` | FALSE POSITIVE |
| 150112 | Password field `login-password` lacks `autocomplete="off"` | ACCEPTED RISK (by design) |
| 150210 | `X-Powered-By: Next.js` | FIXED |
| 150206 | Content-Security-Policy missing | FIXED (one residual, see below) |
| 150135 | HSTS missing | FIXED |
| 531930 | Cross-Origin-Opener-Policy missing | FIXED |
| 531928 | Cross-Origin-Resource-Policy missing | FIXED |
| 531932 | Cross-Origin-Embedder-Policy missing | ACCEPTED RISK |
| 150249 | `Cache-Control: public, max-age=31536000` on `/_next/static` | FALSE POSITIVE |
| 150019 | 308 for `/api/`, `/_next/`, … | FALSE POSITIVE |
| 150126 | Slow links `/api/auth/password-reset/request`, `/api/games` | FALSE POSITIVE (rate-limited anyway) |
| 150142 | Virtual hosts `www`/`test`/`mail`/`stage.byst.re` | INFRA (not our hosts) |
| 150375, 150226, 150104, 150115 | PII / sensitive / e-mail / authentication form fields | ACCEPTED (expected, informational) |
| 38600 | Certificate expires within six months | INFRA (auto-renewed) |
| others | Information gathered (see the last section) | Informational, no action |

## Vulnerabilities

### 150622 — Suspected path manipulation, `/history` — FALSE POSITIVE

The scanner asked for `/history/` and got `308` to `/history`, then `200`. This is Next.js removing the trailing slash before it routes a normal app page. It is not a directory listing and no file is disclosed. Qualys itself says it "could not confirm the sensitivity" (the prerequisite QIDs 150004/150174 were not confirmed).

What `/history` serves to a visitor who is not signed in: the page shell and the loading skeleton, then a redirect to the login page. No game data is sent. See `packages/app/src/app/(frontend)/history/page.tsx`: `if (!session) redirect("/login?next=%2Fhistory")`. The data endpoint `/api/history` answers `401` without a session (`tests/integration/security-headers.test.ts`).

```
$ curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://gomoku.byst.re/history/
308 -> https://gomoku.byst.re/history
$ curl -s https://gomoku.byst.re/history | grep -o 'NEXT_REDIRECT[^"\\]*\|http-equiv="refresh"[^>]*' | sort -u
NEXT_REDIRECT;replace;/login?next=%2Fhistory;307;
http-equiv="refresh" content="1;url=/login?next=%2Fhistory"/
```

### 38794 / 38628 — TLS 1.1 and TLS 1.0 accepted — INFRA

Confirmed: the Cloudflare edge for `byst.re` still accepts TLS 1.0 and 1.1. The local OpenSSL 3 refuses them by default, so `@SECLEVEL=0` is needed to probe:

```
$ openssl s_client -connect gomoku.byst.re:443 -servername gomoku.byst.re -tls1 -cipher 'DEFAULT:@SECLEVEL=0'
New, TLSv1.0, Cipher is ECDHE-ECDSA-AES128-SHA        Protocol  : TLSv1
$ openssl s_client -connect gomoku.byst.re:443 -servername gomoku.byst.re -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0'
New, TLSv1.0, Cipher is ECDHE-ECDSA-AES128-SHA        Protocol  : TLSv1.1
$ openssl s_client -connect gomoku.byst.re:443 -servername gomoku.byst.re -tls1_2
New, TLSv1.2, Cipher is ECDHE-ECDSA-CHACHA20-POLY1305
$ openssl s_client -connect gomoku.byst.re:443 -servername gomoku.byst.re -tls1_3
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
```

The app never sees TLS, so the repository cannot fix this. Owner steps:

1. Find out who controls the `byst.re` zone in Cloudflare (NS: `gina`/`phil.ns.cloudflare.com`). `byst.re` looks like a shared mikr.us domain (see 150142). If the zone is not ours, ask mikr.us support to raise the minimum TLS version, or move the app to our own domain.
2. If the zone is ours: Cloudflare dashboard → zone `byst.re` → **SSL/TLS → Edge Certificates → Minimum TLS Version → TLS 1.2**. Leave TLS 1.3 on.
3. Check again: `openssl s_client -connect gomoku.byst.re:443 -servername gomoku.byst.re -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0'` must end in a handshake failure (`alert protocol version`). `-tls1_2` must still connect.

### 150123 — `gomoku_theme` without HttpOnly — ACCEPTED RISK (by design)

`gomoku_theme` holds only the UI theme (`dark`/`light`). Client JavaScript must read and write it: the theme switch writes it through `document.cookie` (`packages/app/src/components/theme/theme-toggle.tsx`), and the inline head script reads it before the first paint (`themeInitScript` in `packages/core/src/theme/theme.ts`). HttpOnly would break both. An XSS that reads it learns which theme the user picked. It carries no authority. The session cookie is HttpOnly, and so is the language cookie, which only the server sets (`packages/core/src/i18n/locales.ts`).

### 150277 — `gomoku_theme` without SameSite — FALSE POSITIVE

The scanner shows the cookie as `gomoku_theme=dark; expires=…; path=/; domain=gomoku.byst.re; max-age=31535616; secure`. That is how its crawler's cookie jar prints the cookie, not the string the app writes: `domain=` and a `max-age` that has already counted down are jar fields, and the code sets neither. The only writer is `themeCookie()` (`packages/core/src/theme/theme.ts`), and it always adds `SameSite=Lax`:

```
gomoku_theme=<theme>; Path=/; Max-Age=31536000; SameSite=Lax[; Secure]
```

Evidence that production writes it with SameSite (the minified chunk served on 2026-11-15):

```
$ curl -s https://gomoku.byst.re/_next/static/chunks/2by5uw4_rc-0v.js | grep -o '.\{30\}SameSite=Lax.\{20\}'
n=[`gomoku_theme=${e}`,"Path=/","Max-Age=31536000","SameSite=Lax"];return t&&n.p
```

The cookie Chrome stores after a click on the theme switch: `{"name":"gomoku_theme","value":"dark","path":"/","sameSite":"Lax","httpOnly":false,…}` (agent-browser `cookies --json`). The integration test `theme-switch.test.ts` checks `sameSite: "Lax"` on every run. No other code path writes this cookie (`grep -rn gomoku_theme packages`).

### 150319 — weak cookie `gomoku_theme=dark` — FALSE POSITIVE

The check is meant for session identifiers ("Cookie value alphabetic only"). This cookie is a public UI preference with two allowed values, so there is nothing to guess. Session tokens are random and live in their own HttpOnly cookie.

### 150112 — `login-password` without `autocomplete="off"` — ACCEPTED RISK (by design)

Turning off autocomplete on password fields is outdated advice. Browsers ignore `autocomplete="off"` for password fields, and OWASP (ASVS V2.1.11, "paste functionality, browser password helpers, and external password managers are permitted") and NIST SP 800-63B §5.1.1.2 both ask sites to allow password managers. Our forms already declare the correct tokens:

| Form | Fields |
| --- | --- |
| `/login` (`login-form.tsx`) | `email`, `current-password` |
| `/register` (`register-form.tsx`) | `email`, `nickname`, `new-password` |
| `/forgot-password` | `email` |
| `/reset-password` | `new-password` |
| `/account` (change password, e-mail, delete) | `current-password`, `new-password`, `email` |

The design-system `PasswordField` (`packages/ui/src/game/password-field.tsx`) does not even allow `off`: its type is `"current-password" | "new-password"`. No change.

## Information-level weaknesses

### 150210 — `X-Powered-By: Next.js` — FIXED

`poweredByHeader: false` in `packages/app/next.config.ts`. Tests: `next.config.test.ts` ("does not announce the framework") and `security-headers.test.ts` (`x-powered-by` is null on pages, the API and assets).

### 150206 — Content-Security-Policy missing — FIXED

The CSP follows the nonce variant of the Next 16 guide (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):

- **Pages** (`src/proxy.ts`, builder `pageContentSecurityPolicy` in `packages/core/src/http/content-security-policy.ts`): each request gets a new 128-bit nonce. Next reads it from the request header and puts it on every framework script. The frontend layout passes it to the inline theme script (`x-nonce`).
  ```
  default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  ```
  Development adds `'unsafe-eval'` only (React's error stacks). Styles keep `'unsafe-inline'` because React `style` attributes carry no nonce. A style cannot run code, and the script policy has no `'unsafe-inline'`. The admin panel `/backend` gets the same policy. Prefetch requests skip the proxy (they render no document).
- **API and `/_next/*`** (`next.config.ts`): `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox`. A browser applies this only if one of these responses is opened as a document (an SVG, an error body). Scripts and styles loaded by our pages are not affected. Next's config headers **replace** a route handler's header of the same name, so this policy also stands in for the QR route's own `default-src 'none'; sandbox` (it contains it). Lesson: `.ai/lessons/2026-11-15-next-config-headers-override-route-headers.md`.
- Every page is rendered per request (the layouts read cookies), so no prerendered HTML goes out without the nonce. The build lists all pages as `ƒ`.

Verification on the local production build:

- `security-headers.test.ts` loads `/`, `/login`, `/register`, `/forgot-password`, `/play`, `/join` and `/lobby`. Every `<script>` must carry the nonce from the response header, and two requests must get different nonces. `/backend` must have the policy, and the API (also a `404` route) and `/_next` the resource policy.
- In a real browser (same test file), `/login` hydrates (its client components run), and an injected `<img onerror=…>` is blocked with a `securitypolicyviolation` (`script-src-attr`).
- `theme-switch.test.ts` checks that the nonce-carrying inline theme script still runs before the first paint (light system preference → light page).
- The whole integration suite runs under the CSP (validation gate below).

**Residual:** a URL that matches no route gets Next's default 404 page. It is prerendered at build time (`○ /_not-found`), so its HTML has no nonce and the browser blocks its scripts. The page has no interactive parts. Its server-rendered text ("404 This page could not be found.") still shows, and the status stays `404`. The proper fix is an app-wide `global-not-found.tsx` (experimental in Next 16, our own localized 404 page). That is a new player-facing page with PL/EN/FR texts, so it is proposed as a follow-up and not done here. A `notFound()` from an existing route (for example an unknown game) renders per request and has the nonce.

### 150135 — HSTS missing — FIXED

`Strict-Transport-Security: max-age=63072000` on every response (`next.config.ts`). T-08 left HSTS out because it is hard to undo. That risk is small now: the site is reachable only over HTTPS (Cloudflare), and the header pins **this host only**:

- no `includeSubDomains`: `byst.re` and its other subdomains are not ours to pin (see 150142);
- no `preload`: the preload list is very hard to leave, and preload requires `includeSubDomains`.

Browsers ignore the header on plain HTTP (RFC 6797 §8.1), so `next dev`, local `next start` and the integration tests over `http://` are not affected. A move to another domain later needs nothing special: the pin only says "always HTTPS for gomoku.byst.re".

### 531930 / 531928 — COOP and CORP missing — FIXED

`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin` on every response.

- COOP: the app opens no pop-ups and is never opened as a pop-up that needs `window.opener` (no OAuth, no payment windows). Invite links opened from another site get a separate browsing context, which is what we want.
- CORP: every resource (assets, the QR SVG `/api/games/[id]/qr`, the favicon) is used only by our own pages. E-mails contain no images from the site. Link previews (chat apps, search engines) fetch from servers, and CORP does not apply to them. CORS requests (an MCP client in a browser) are governed by CORS, not CORP.
- Checked by the integration suite (invite, QR, spectate and show scenarios run with both headers on).

### 531932 — COEP missing — ACCEPTED RISK

`Cross-Origin-Embedder-Policy: require-corp` exists to make a page cross-origin isolated (needed for `SharedArrayBuffer` and high-resolution timers). The app uses neither in the browser; the bot's `worker_threads` run on the server. COEP adds no protection on its own. It would only make any future cross-origin embed fail, so we do not send it (asserted absent in the tests).

### 150249 — `Cache-Control: public, max-age=31536000, immutable` on `/_next/static` — FALSE POSITIVE

The flagged URLs are content-hashed JS/CSS build chunks (`/_next/static/chunks/<hash>.js|css`). They are public and identical for every user, and a new build gets new names. Long immutable caching is the intended setup. Pages and the API send `private, no-cache, no-store` and `private, no-store` (asserted in `security-headers.test.ts`, "Cache-Control of the JSON API").

### 150019 — 308 for `/api/`, `/_next/`, `/api/auth/` … — FALSE POSITIVE

This is the same Next.js trailing-slash redirect as 150622: `/<path>/` → `308` → `/<path>`. The path without the slash then answers `404` (no route), or `405` for routes that accept only `POST`. No directory listing exists.

### 150126 — slow links `/api/auth/password-reset/request`, `/api/games` — FALSE POSITIVE (rate-limited anyway)

The "0 bytes/sec" comes from `GET` on routes that accept only `POST`. Next answers `405` with an empty body, and an empty body divided by time gives 0 B/s:

```
$ curl -s -o /dev/null -w "%{http_code} %{time_total}s %{size_download}B\n" https://gomoku.byst.re/api/auth/password-reset/request
405 0.226024s 0B
```

The real `POST` handlers are rate-limited anyway:

- `POST /api/auth/password-reset/request`: 10 per hour per client address (`PASSWORD_RESET_REQUEST_IP_LIMIT`, `route.ts`), plus a per-e-mail limit in the service.
- `POST /api/games`: 10 per hour per address for guests (`games-create-guest`, `route.ts`), plus BR-13 (one active game per player).

Cloudflare sits in front for volumetric floods.

### 150142 — virtual hosts `www`, `test`, `mail`, `stage` on the same IP — INFRA (not our hosts)

`gomoku.byst.re` resolves to a Cloudflare anycast address (`104.21.91.212`). Many unrelated sites share it, and `byst.re` is a shared mikr.us domain: `www.byst.re` and `mail.byst.re` answer with the mikr.us "CYTR.US" page, and `test.byst.re` with the mikr.us error page. None of them is our app (`curl --resolve <host>:443:104.21.91.212`). Nothing in the repository can change this. The owner may move the app to a domain of their own (that would also give control of the TLS settings above).

### 150375 / 150226 / 150104 / 150115 — PII, sensitive and e-mail fields, authentication forms — ACCEPTED (expected)

`/register`, `/login` and `/forgot-password` collect an e-mail and a password because that is how accounts work. All of them are served only over HTTPS (now pinned with HSTS) and posted same-origin (`form-action 'self'`). Passwords are hashed (bcrypt). The forgot-password answer does not reveal whether an account exists. These are informational inventory items.

### 38600 — certificate expires within six months — INFRA (auto-renewed)

The certificate is `CN=byst.re` (SAN `byst.re`, `*.byst.re`), issued by Google Trust Services WE1, valid 2026-09-29 → 2026-12-28. It is a 90-day Cloudflare Universal SSL certificate that Cloudflare renews on its own. Every such certificate "expires within six months", so this finding will always be present. No action, unless the owner moves to a custom certificate.

## Information gathered (no action)

- 150082 Clickjacking protection present (`X-Frame-Options: DENY`, now also `frame-ancestors 'none'`).
- 150176 / 150621 JavaScript libraries: NextJS **16.4.3** in production. The repository is on 16.4.5, which ships with the next epic's deploy (deploy per epic).
- 150247 Web server and technologies: Cloudflare in front, Next.js (no longer announced in `X-Powered-By`).
- 86002 / 38116 / 38704 / 38706 / 38597 / 38291 / 38718 / 150730 Certificate details, key exchange, protocol properties, version tolerance, session caching, Certificate Transparency, HTTP/2. All are Cloudflare edge properties and fine apart from TLS 1.0/1.1 above.
- 150611 / 150546 3xx during the crawl, response code of the first link: the trailing-slash and login redirects described above.
- 150528 4xx during scanning: `404` for missing routes, `405` for `GET` on `POST`-only routes, `401` without a session. All expected.
- 150009 / 150148 / 150172 / 150152 / 150020 / 150021 / 150606 / 150605 / 45038 / 150028 / 150054: crawl statistics, collected cookies and e-mail addresses (none beyond the public pages), scan diagnostics, scan time. Inventory only.

## Header evidence (local production build)

Before (`main` at `f42443b`):

```
### /login
HTTP/1.1 200 OK
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), bluetooth=(), camera=(), …
X-Powered-By: Next.js
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
### /api/health
HTTP/1.1 200 OK
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), …
```

After (this branch):

```
### /login
HTTP/1.1 200 OK
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), bluetooth=(), camera=(), …
Strict-Transport-Security: max-age=63072000
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
content-security-policy: default-src 'self'; script-src 'self' 'nonce-52s1/778fnK+0lTWhcMsDQ==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
### /api/health
HTTP/1.1 200 OK
… (same baseline, HSTS, COOP, CORP)
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox
```

## Owner follow-ups

1. Cloudflare minimum TLS version 1.2 (steps under 38794/38628). Who does it depends on who controls the `byst.re` zone.
2. Optional: a domain of our own instead of the shared `byst.re`. That gives control over TLS, HSTS `includeSubDomains`/preload, and removes 150142.
3. Follow-up issue: an app-wide localized 404 (`global-not-found.tsx`) so that unmatched URLs also render with the CSP nonce.
4. After the next deploy, scan again and check that 150210, 150206, 150135, 531930 and 531928 are gone.
