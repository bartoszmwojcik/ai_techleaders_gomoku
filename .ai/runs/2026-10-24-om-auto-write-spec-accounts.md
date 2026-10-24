# Przebieg: `om-auto-write-spec` dla #34–#39 (2026-10-24)

**Cel.** Specyfikacje (projekt, bez implementacji) dla zgłoszeń konta: #34 potwierdzenie e-maila, #35 reset hasła, #36 zmiana hasła, #37 usunięcie konta, #38 dostawca poczty, #39 sprzątanie rekordów. #28 pominięte — pokrywa je specyfikacja #19 (Q6).

**Kroki i wyniki.**
1. Claim każdego zgłoszenia (przypisanie, `in-progress`, komentarz) — bez konfliktów.
2. Osobny worktree i branch `spec/<slug>` od `origin/main` dla każdego zgłoszenia.
3. Specyfikacje w trybie autonomicznym (sekcja „Resolved assumptions”).
4. Niezależny przegląd: #34 osobno, #35–#39 razem. Poprawki wprowadzone (m.in. harness testów i plik-skrzynka zamiast logu z tokenem, `after()` z własnym scope, warunkowe `UPDATE` przeciw wyścigom, kolejność blokad `users`, spike SMTP na mikr.us, `docker exec` w cronie).
5. PR-y: #42 (draft), #43 (draft), #44, #45 (draft), #46 (draft), #47 — etykiety `review`, `documentation`, `skip-qa`, priorytet, `risk-low`; komentarze z założeniami na PR i w zgłoszeniu; zwolnienie claimu.

**Otwarte decyzje właściciela (⚠).** #34 Q1 (produkcja bez dostawcy), Q9 (reset dla niepotwierdzonego adresu); #35 Q1 (zmiana BR-19); #37 Q1 (schemat #29), Q3 (nieodwracalność); #38 Q1 (Gmail SMTP), Q2 (`nodemailer`), Q5 (spike SMTP).

**Ograniczenia.** Mockupy pominięte — brak deskryptora `om-prepare-test-env`. Specyfikacje nie były implementowane ani testowane.

**Status:** zakończony.
