# Czas serwera w odliczaniu i ograniczone odpytywanie

**Problem:** odliczanie oferty rewanżu liczono z `Date.now()` względem `expiresAt` serwera, a zakończona partia była odpytywana co 3 s bez końca (karta otwarta przez dni, token gościa wygasa po 1 h).

**Kontekst:** review UI rewanżu (E02-S06, #88); spec `.ai/specs/implemented/2026-10-29-game-rematch.md`.

**Reguła:** każde odliczanie do momentu z serwera liczysz względem `clock.now` z odpowiedzi + `performance.now()` od jej nadejścia (`use-server-now.ts`), nigdy względem zegara urządzenia; każde odpytywanie ma tempo spadające przy bezczynności, wznowienie po powrocie na kartę i koniec związany z ważnością dostępu; szum zakończonej partii (offline) nie pokazuje czerwonych banerów. Test z zegarem urządzenia ±6 min jest obowiązkowy.
