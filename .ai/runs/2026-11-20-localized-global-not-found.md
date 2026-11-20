# Run: zlokalizowana globalna strona 404 z nonce CSP (#328)

- Data: 2026-11-20
- Skill: `om-auto-create-pr` (Engine: om-auto-create-pr, steps: 9, --loop: no)
- Zgłoszenie: #328
- Gałąź: `feat/localized-global-not-found`

## Cel

Adres, który nie pasuje do żadnej trasy, dostaje własną, zlokalizowaną stronę 404 renderowaną per żądanie (z nonce CSP z proxy), zamiast domyślnej strony Next.js prerenderowanej w buildzie (`○ /_not-found`), której skrypty blokuje CSP.

## Zakres

- `packages/app/src/app/global-not-found.tsx` (+ `experimental.globalNotFound` w `next.config.ts`), dynamiczna (czyta nagłówki/cookies), z nonce na skrypcie motywu, `frontend.css`, komponenty DS graczy.
- Teksty w katalogu PL + EN/FR (+ DE, jeśli katalog DE istnieje dla grupy) — test parzystości.
- Test jednostkowy (100%) i scenariusz integracyjny: `/nie-ma-takiej-strony` → 404, skrypty z nonce, brak naruszeń CSP w konsoli.
- Aktualizacja triage (`.ai/docs/2026-11-15-security-scan-triage.md`, sekcja „Residual”).

## Non-goals

- Zmiana istniejących `not-found.tsx` w trasach gier (już renderowane per żądanie).
- Zmiany CSP ani proxy poza tym, czego wymaga 404.
- Panel `/backend` (nieznany adres pod `/backend/*` też dostaje tę samą globalną 404 — to akceptowalne).

## Ryzyka

- `globalNotFound` jest eksperymentalne w Next 16 — sprawdzić przewodnik w `node_modules/next/dist/docs/`.
- Globalna 404 omija root layouty, więc musi sama wyrenderować `<html>`/`<body>` i zaimportować CSS.

## Progress

PR: #332

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Strona 404

- [x] 1.1 Przeczytać przewodnik Next 16 o global-not-found i włączyć flagę — fee340f
- [x] 1.2 Teksty 404 w katalogach PL/EN/FR — fee340f
- [x] 1.3 Komponent global-not-found z nonce i motywem — fee340f
- [x] 1.4 Testy jednostkowe strony i konfiguracji — fee340f

### Phase 2: Weryfikacja i dokumentacja

- [x] 2.1 Scenariusz integracyjny 404 z CSP — b3a9a58
- [x] 2.2 Aktualizacja triage bezpieczeństwa — f68ba0f
- [x] 2.3 Pełna bramka walidacyjna — 37770f3
- [x] 2.4 Review om-auto-review-pr — 6279a37
- [x] 2.5 Podsumowanie na PR

## Rezultat

- Bramka: lint, typecheck, test (4695/4695, próg 100%), build (`ƒ /_not-found`) — zielone. Integracja: 1068/1070 w pełnym przebiegu; `pages.test.ts` poprawiony pod nową stronę (37770f3), `show-pages.test.ts` (limit czasu ruchu bota 250 ms, 267 ms pod obciążeniem) niezwiązany — oba pliki zielone po ponownym uruchomieniu.
- Status: complete. Ręczne QA (`needs-qa`) — do zrobienia przez właściciela.
