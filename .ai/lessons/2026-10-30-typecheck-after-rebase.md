# Po rebase zawsze `npm run typecheck`

- **Problem:** po rebase gałęzi rewanżu na `main` (poddanie #104 i gość-twórca #101) git nie zgłosił konfliktu, a w pliku powstały dwie różne funkcje `readGuestToken` (jedna z gałęzi, jedna z `main`). Błąd wyszedł dopiero w `npm run typecheck`.
- **Przyczyna:** konflikt semantyczny — zmiany w różnych miejscach tego samego pliku scalają się czysto, ale razem nie tworzą poprawnego programu.
- **Reguła:** po każdym rebase lub merge `main` do gałęzi uruchom `npm run typecheck` (i testy dotkniętych pakietów) PRZED `push`; nie ufaj braku konfliktów w gicie.
- **Powiązane:** `2026-10-30-two-green-prs-can-break-main-together.md`, gałąź `feat/e02-rewanz`.
