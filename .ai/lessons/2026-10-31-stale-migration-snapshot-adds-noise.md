# Nieaktualny snapshot migracji dopisuje obce zmiany do nowej migracji

- **Problem:** `npm run db:migration:create` dla tabeli `lobby_seekers` wygenerował także `alter column … set default` dla `games`, bo zatwierdzony `.snapshot-gomoku.json` był nieaktualny (18 KB, bez tabel `games`).
- **Kontekst:** snapshot jest aktualizowany tylko przy `migration:create`; wcześniejsze migracje pisane ręcznie albo przycinane zostawiły go w tyle. Każde kolejne `create` pokazuje wtedy dryf, którego nie wprowadziła bieżąca zmiana.
- **Reguła:** po `migration:create` przeczytaj wygenerowany plik i usuń instrukcje niezwiązane ze zmianą (zostaw w nim wyłącznie nowy schemat); odświeżony snapshot zatwierdź razem z migracją i napisz o tym w opisie PR-a. Sprawdź `up` → `down` → `up` na PostgreSQL.
- **Powiązane:** `.ai/specs/implemented/2026-10-31-lobby-seeking-status.md` (odstępstwo 10).
