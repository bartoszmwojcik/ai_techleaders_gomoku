# Rekomendacje E15-S09: e-maile, teksty MCP, strona o przetwarzaniu danych (2026-11-13, przygotowane 2026-11-14)

- **Właściciel decyzji:** Bartosz Wójcik. **Charakter:** rekomendacja agenta do przyjęcia albo odrzucenia; **nie** jest decyzją. Pytanie Q-26 w `product-brief.md` zostaje `open`, dopóki właściciel jej nie przyjmie (spec `.ai/specs/2026-11-13-e15-completion.md`, Q4; zatwierdzona spec `.ai/specs/2026-11-10-i18n.md`, B7, I20).
- **Źródła:** `product-brief.md` (D-38, A-25, BR-20, Q-26), `research/decisions/2026-11-10-i18n.md`, stan kodu po paczkach C1–C6 (`.ai/runs/2026-11-14-e15-continuation.md`).

## Rekomendacja (sama nie wymaga kodu ani migracji)

| Obszar | Rekomendacja | Dlaczego | Warunek zmiany |
|---|---|---|---|
| E-maile (potwierdzenie adresu, reset hasła, zmiana adresu) | **Zostają po polsku.** Bez kolumny `users.locale`, bez migracji. | Odbiorcami są dziś znajomi z grona S2 (A-25); język e-maila wymaga zapisania języka przy koncie, czyli zmiany modelu danych (`risk-high`), dla grupy, która zakłada konto rzadko (goście grają bez konta). | Odwołanie A-25 albo zgłoszenie od gracza spoza Polski, który nie zrozumiał e-maila → nowa specyfikacja (`users.locale`, migracja, wybór języka przy rejestracji). |
| Teksty MCP (opisy narzędzi, komunikaty błędów dla agenta) | **Zostają po polsku.** | Agent czyta polski bez trudu; zmiana opisu narzędzia może zmienić zachowanie agenta, a kontrakt MCP (`code`, `reason`) jest już niezależny od języka. | Agent, który myli się na polskim opisie (zgłoszenie z logów) → osobna zmiana opisów z testem zachowania. |
| Strona o przetwarzaniu danych w innych językach | **Nieuruchomiona**, dopóki trwa A-25 (D-22, Q-11, Q-16 bez zmian). | Bez graczy spoza grona znajomych obowiązki informacyjne wobec nich nie powstają; tekst prawny wymaga recenzji, nie szkicu LLM. | Odwołanie A-25 → decyzja właściciela i recenzja prawna. |

**Przyjęcie** przez właściciela („przyjmuję rekomendację S09”) = Q-26 → `decided` z tą treścią, zamknięcie #299, brak dalszej fazy. **Odrzucenie** któregokolwiek wiersza = nowa specyfikacja (zmiana modelu danych lub kontraktu MCP, `risk-high`).

## Zadania poza epikiem #289 (do założenia przez właściciela)

### E15-S10 — recenzja natywna DE

- Wejście: `.ai/qa/2026-11-13-i18n-all.csv` (kolumna DE, wszystkie przestrzenie; niemiecki jest kompletnym szkicem `draft`).
- Wynik: poprawki w `packages/app/src/i18n/catalogs/de/*.ts`; w `catalogs/status.ts` każda przestrzeń DE → `{ state: "reviewed", reviewer, date }` (prawdziwy recenzent i dzień — I17); dopiero gdy **wszystkie** przestrzenie DE są `reviewed`, dopisanie `"de"` do `SWITCHER_LOCALES` (`core/src/i18n/locales.ts`). Bramka: `catalogs/status.test.ts` (język spoza `pl`/`en`/`fr` w przełączniku tylko przy `reviewed`).
- Ryzyko: niskie (teksty i jedna linia stałej); przegląd 320 px po niemiecku w obu motywach.

### E15-S11 — recenzja natywna FR

- Wejście: ten sam plik CSV, kolumna FR (wszystkie przestrzenie, łącznie z `show` i `header` z E15-S02).
- Wynik: poprawki w `catalogs/fr/*.ts` i statusy `reviewed` w `catalogs/status.ts`. Francuski jest już w przełączniku (decyzja zatwierdzonej specyfikacji: szkic widoczny, jakość deklaruje `reviewed`), więc zadanie nie zmienia przełącznika.

## Czego agent nie zrobił

- Nie zmienił statusu Q-26 ani żadnego statusu `reviewed` (I17).
- Nie dodał kolumny `users.locale`, migracji ani zmian MCP.
