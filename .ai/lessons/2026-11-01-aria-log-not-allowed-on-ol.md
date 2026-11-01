# `role="log"` nie jest dozwolone na `<ol>`

- **Problem:** spec czatu (E07-S01) opisywała listę wiadomości jako `<ol role="log">`; test stories (axe, `aria-allowed-role`) odrzucił to, a `<li>` poza listą dołożyło drugi błąd (`listitem`).
- **Reguła:** rolę `log` (i inne role „live”) nadawaj blokowi (`<div role="log">`) wokół `<ol>`; blok przewijany (`overflow-y-auto`) dostaje `tabIndex={0}` i obrys fokusu, żeby klawiatura mogła go przewinąć. Rolę z opisu w specyfikacji sprawdź w `npm run test:stories -w @gomoku/ui` przed wdrożeniem w aplikacji.
- **Powiązane:** `.ai/specs/2026-10-31-game-chat.md` (UI/UX, „Elementy”), PR czatu E07-S01.
