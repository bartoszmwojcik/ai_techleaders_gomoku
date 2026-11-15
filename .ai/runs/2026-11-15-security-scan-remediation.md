# Security scan remediation (Qualys WAS, 2026-11-10)

Engine: om-auto-create-pr (steps: 7, --loop: no)

## Goal

Fix the real findings of the Qualys WAS scan of https://gomoku.byst.re and prove the rest false positive, accepted risk or infrastructure-side, in one triage document.

## Scope

- `packages/app/next.config.ts`: `poweredByHeader: false`, HSTS (no `includeSubDomains`, no `preload`), COOP/CORP `same-origin`, a strict CSP for API and `/_next` responses.
- `packages/app/src/proxy.ts`: per-request nonce CSP for every page (Next 16 guide "Content Security Policy"), next to the existing `?lang=` redirect.
- `packages/core/src/http/content-security-policy.ts`: pure CSP builders shared by the proxy and the config.
- `(frontend)/layout.tsx`: the inline theme script carries the nonce.
- Tests for all of it (100% per file), integration check that pages carry the CSP and run without violations.
- `.ai/docs/2026-11-15-security-scan-triage.md`: every finding with verdict and evidence.

## Non-goals

- Cloudflare settings (minimum TLS version, certificates, HSTS at the edge) — owner steps only.
- COEP `require-corp` (no cross-origin isolation needed) — accepted risk.
- Deploy, merge.

## Risks

- A statically prerendered page would get a nonce header but no nonce in its HTML: scripts blocked. Mitigation: build output check (all pages `ƒ`), integration tests in a real browser.
- Proxy now runs for every page request (cost: one header computation).

## Progress

PR: #319

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Headers

- [x] 1.1 CSP builders in core — fff71f6
- [x] 1.2 Proxy sets the nonce CSP on pages; layout passes the nonce to the theme script — fff71f6
- [x] 1.3 next.config: poweredByHeader, HSTS, COOP, CORP, API CSP — d6d3746

### Phase 2: Verification

- [x] 2.1 Integration scenario: CSP and headers on pages and API, no CSP violations — 3d9f004
- [x] 2.2 Before/after header evidence from a local build — dcfb81d

### Phase 3: Triage

- [x] 3.1 Triage document covering every finding — dcfb81d
- [x] 3.2 Full validation gate — cb32139

## Validation (2026-11-15)

- `npm run lint`: 0 errors (2 pre-existing warnings in `game-service.test.ts`)
- `npm run typecheck`: OK
- `npm test`: 405 files, 4636 tests, 100% statements/branches/functions/lines
- `npm run build`: OK (all pages `ƒ`, only `○ /_not-found` static)
- `TMPDIR=/tmp npm run test:integration`: 98 files, 1064 tests passed
