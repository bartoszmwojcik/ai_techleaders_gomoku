# Strażnik kodu liczy instrukcje, nie pliki

- **Problem:** test strażnik licznika (E06-S03) sprawdzał tylko, czy plik z `update games set ... status = 'finished'` zawiera choć jedno wywołanie `recordFinishedGame(`; drugi, nowo dopisany UPDATE kończący partię w tym samym pliku przeszedłby niezauważony.
- **Reguła:** strażnik „każde miejsce musi X” porównuje liczbę miejsc z liczbą wywołań X (po jednym na instrukcję), a nie obecność X w pliku; test negatywny dodaje kolejną instrukcję obok już obsłużonej.
- **Powiązane:** `.ai/specs/implemented/2026-10-31-finished-games-pair-counter.md`, PR #165.
