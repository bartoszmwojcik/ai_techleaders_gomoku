# Interesariusze i RACI — discovery: Gomoku 1:1 online

- **Data:** 2026-10-20
- **Autor:** Bartosz Wójcik
- **Tryb discovery:** `own` (projekt własny)
- **Źródło:** wywiad `om-discover` z Bartoszem Wójcikiem, 2026-10-20 (odpowiedzi na pytania pojedyncze). Wpisy oznaczone *propozycja* zaproponował agent; Bartosz zatwierdził je w całości 2026-10-20 („zapisać”).
- **Kontekst:** `.ai/specs/product-brief.md`

## Interesariusze

Lista obejmuje tylko role potwierdzone przez właściciela.

| # | Interesariusz | Rola | Źródło |
|---|---|---|---|
| S1 | Bartosz Wójcik | Właściciel, użytkownik, płaci za hosting. Decyduje o zakresie, cenie i kanale. | wywiad 2026-10-20 |
| S2 | Znajomi | Użytkownicy (grają). | wywiad 2026-10-20 |
| S3 | Gracze zewnętrzni (planowani) | Docelowi użytkownicy i źródło feedbacku. Mają przyjść z promocji lub publikacji w kanale `unknown`. Na dziś jeszcze ich nie ma. | wywiad 2026-10-20 |

| Pytanie | Odpowiedź |
|---|---|
| Kto korzysta? | S1 i S2. S3 to grupa docelowa, której jeszcze nie ma. |
| Kto płaci? | S1 płaci za hosting. Za grę nikt nie płaci. |
| Kto może zablokować? | Nikt (deklaracja właściciela). |
| Kto decyduje o zakresie? | S1, samodzielnie. |
| Kto decyduje o cenie? | S1, samodzielnie. Na razie gra jest darmowa. |
| Kto decyduje o kanale? | S1, samodzielnie. Kanał: `unknown`. |

### Unknown

- Kanał promocji lub publikacji: `unknown`.
- Regulamin i moderacja kanału: `unknown`, do sprawdzenia po wyborze kanału.
- Dostawca i koszt hostingu: `unknown`.
- Zainteresowanie S2 i S3 grą: `unknown`.

## Siatka władza / zainteresowanie

| | Zainteresowanie wysokie | Zainteresowanie `unknown` |
|---|---|---|
| **Władza wysoka** | S1 Bartosz Wójcik: zarządzać blisko | — |
| **Władza niska** | — | S2 Znajomi, S3 Gracze zewnętrzni |

Niską władzę S2 i S3 potwierdził właściciel: wszystkie decyzje podejmuje S1, a nikt nie może zablokować. Ich zainteresowania nie potwierdzono. Dla S3 zainteresowanie jest hipotezą do sprawdzenia, nie obserwacją.

## RACI dla decyzji discovery

Każda decyzja ma dokładnie jedną osobę A.

| Decyzja | R | A | C | I |
|---|---|---|---|---|
| D1 Zakres wersji pokazywanej na zewnątrz | S1 | S1 | S2 *(propozycja)* | unknown |
| D2 Cena / model (na razie darmowa) | S1 | S1 | unknown | S3 *(propozycja)* |
| D3 Kanał promocji / publikacji | S1 | S1 | unknown | unknown |
| D4 Sposób zbierania feedbacku | S1 | S1 | S2 *(propozycja)* | S3 *(propozycja)* |

## Ryzyka

- **Koncentracja decyzji.** S1 jest R i A przy każdej decyzji, więc nikt nie weryfikuje jego decyzji niezależnie. Jedyną kontrolą z zewnątrz jest feedback od S2 i S3.
- **Blokada przez kanał.** Deklaracja „nikt nie może zablokować” może przestać obowiązywać po wyborze kanału, bo regulamin lub moderacja platformy mogą ograniczyć publikację. Trzeba to sprawdzić przy D3.

## Przegląd

Agent sprawdził szkic sam (inline), bez niezależnego przeglądu przez osobnego subagenta.
