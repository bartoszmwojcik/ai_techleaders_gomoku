# Spójność specyfikacji auth: limity, kolejność wdrożenia, cleanup

**Problem:** sześć specyfikacji auth (#34–#39) pisanych osobno miało rozbieżności: sprzeczny opis ponownego użycia tokenu (200 vs `INVALID_TOKEN`), wspólny dzienny limit wysyłek, który pozwalał zagłodzić reset hasła, limit resetu możliwy do wykorzystania do blokowania cudzych kont, brak kroków sprzątania tokenów w planach, konta niepotwierdzone zajmujące e-mail bez końca.

**Reguła:** przy specyfikacjach zależnych od siebie sprawdzaj: (1) czy API/edge cases opisują to samo zachowanie, (2) czy współdzielone limity mają osobne pule dla krytycznych ścieżek, (3) czy limit „na e-mail/konto” nie służy do blokowania ofiary, (4) czy plan każdej encji z `expiresAt` ma regułę sprzątania, (5) kolejność wdrożenia względem spike'ów infrastruktury (#38, #30).

Powiązane: `.ai/specs/2026-10-24-*.md` (account-deletion, email-provider, email-verification, expired-records-cleanup, password-change, password-reset).
