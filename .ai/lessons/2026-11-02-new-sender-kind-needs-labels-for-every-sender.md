# Nowy rodzaj nadawcy czatu: etykiety dla wszystkich nadawców

- **Problem:** panel czatu widza (E10-S03) najpierw dostał `labelOf={() => null}`, bo „widz widzi tylko swoje”. Widz czyta też wiadomości graczy, więc pusta etykieta nigdy nie byłaby wywołana w testach z samymi wiadomościami widzów — wyłapał to dopiero próg pokrycia 100% (martwa funkcja).
- **Reguła:** dodając rodzaj nadawcy/odbiorcy, przejdź przez każdą parę (kto pisze × kto czyta) i dla każdej napisz test; martwa funkcja w raporcie pokrycia to sygnał brakującego przypadku, nie powód do `ignore`.
- **Drugie:** testy integracyjne z listą kolumn lub kluczy odpowiedzi (`information_schema`, `Object.keys`) trzeba zaktualizować razem z migracją/typem — grep po `chat_messages`/kluczach przed pełnym przebiegiem oszczędza 10 min.
- **Środowisko:** w tym sandboxie `docker exec/run` na bazie dev jest zablokowane; tymczasową bazę do `migration:create` utwórz skryptem `pg` z Node (`create database …`) i usuń po pracy.
- Powiązane: `.ai/specs/implemented/2026-11-02-spectator-chat-and-public-flag.md`.
