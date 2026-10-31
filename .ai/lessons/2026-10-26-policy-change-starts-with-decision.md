# Zmiana polityki zaczyna się od decyzji w briefie

- **Problem:** po przeglądzie prototypu okazało się, że zatwierdzona polityka kont (potwierdzenie e-maila przed grą, hasło 16 znaków) jest zbyt kosztowna; zmiana dotykała ok. 20 artefaktów (brief, 6 specyfikacji, backlog, zgłoszenia, design system, mapa, prototypy).
- **Kontekst:** recenzent (challenger) wskazał, że zmiana pakietowa jako jeden PR jest nie do zrecenzowania, a decyzja bez dowodu musi być oznaczona jako osąd właściciela.
- **Reguła:** zmianę polityki zaczynaj od wpisu decyzji (brief: wiersze nadpisujące, `research/decisions/`), z odrzuconymi alternatywami, przyjętymi ryzykami i oznaczeniem „osąd właściciela, nie badanie”; dopiero potem specyfikacje i mapa, potem prototypy, a edycje zgłoszeń jako osobna, jawna pozycja przed startem implementacji. Stare ID zostają (przekreślenie i „Nadpisane przez”), nie przenumeruj.
- **Powiązane:** `.ai/specs/briefs/2026-10-26-account-onboarding-simplification.md`, `.ai/specs/implemented/2026-10-26-account-onboarding-simplification.md`, `.ai/specs/research/decisions/2026-10-26-onboarding-simplification.md`.
