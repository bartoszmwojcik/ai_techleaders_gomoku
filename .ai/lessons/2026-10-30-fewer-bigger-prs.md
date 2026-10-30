# Mało, ale pełnych PR-ów

- **Problem:** w dwa dni powstało 20 PR-ów (#78–#97): osobne PR-y na fazy, na dokumenty, na drobne poprawki z przeglądu (np. #85, #91) i naprawę `main` po kolizji dwóch PR-ów (#86). Właściciel: „jest ich dużo więcej niż jestem do tego przyzwyczajony”; każdy PR to klik scalenia, „Update branch” i ponowne CI.
- **Przyczyna:** dzieliłem pracę według własnego schematu (faza = PR, dokument = PR, poprawka = PR), a nie według tego, co właściciel chce przeglądać.
- **Reguła:** jeden PR na funkcję (kod, testy, dokumentacja, adnotacje w specyfikacji); osobny PR tylko dla specyfikacji zatwierdzanej przed kodem; poprawki z przeglądu i drobiazgi dołączam do PR-a, którego dotyczą; opis krótki (zakres, odstępstwa, czego nie sprawdzono, kolejność scalania). Reguła jest też w `AGENTS.md` (Przepływ pracy, pkt 11).
- **Powiązane:** lekcja „dwa zielone PR-y mogą razem zepsuć main” (większa liczba równoległych PR-ów zwiększa to ryzyko).
