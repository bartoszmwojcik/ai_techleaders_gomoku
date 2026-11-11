# Nowa droga zakończenia partii a ważność tokenu uczestnika

**Problem.** Administrator kończył trwający pokaz bot vs agent (`status = 'cancelled'`), a agent przy następnym `get_state` dostawał `INVALID_TOKEN` zamiast stanu `cancelled` (QA PR #306). `PARTICIPANT_TOKEN_VALID_SQL` liczył godzinę ważności od `finished_at` tylko dla `finished`, a dla `cancelled` — od niezużytego zaproszenia; zaproszenie agenta zużyło dołączenie, a `END_SHOW_SQL` nie zapisywał końca.

**Kontekst.** E14-S03 (`.ai/specs/2026-11-09-show-mode.md`, P7: „agent widzi `cancelled` jak każdy zamknięty zegar”). Testy jednostkowe nie mogły tego złapać (SQL), a test integracyjny kończył tylko pokaz czekający.

**Reguła.** Każda nowa droga, która zamyka partię z uczestnikiem na tokenie (gość, agent), musi przejść przez `PARTICIPANT_TOKEN_VALID_SQL` i `db:cleanup` (zerowanie skrótów po `finished_at`): zapisz moment końca (`finished_at`) albo świadomie unieważnij token, i dodaj scenariusz integracyjny „uczestnik czyta stan po zakończeniu tą drogą”.

Powiązane: #283, PR #306, `.ai/runs/2026-11-11-e14-s03-bot-vs-agent.md`.
