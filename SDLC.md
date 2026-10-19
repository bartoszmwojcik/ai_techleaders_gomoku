# Proces dostarczania zmian

## Cel

Ten plik opisuje, jak praca przechodzi od zgłoszenia do zmergowanego PR w tym repozytorium. Proces egzekwują skille agentów skonfigurowane w `.ai/agentic.config.json`; ludzie czytają go tutaj. PR-y trafiają do `main`; zgłoszenia i PR-y żyją w GitHubie, a każda operacja na trackerze wykonywana przez skille jest zdefiniowana w `.ai/trackers/github.md` (edytuj ten plik, żeby rozszerzyć lub nadpisać zachowanie trackera).

Praca wchodzi dwiema drogami: jako swobodny opis zadania przekazany agentowi albo jako zgłoszenie (issue). Obie zbiegają się w tej samej pętli review, tej samej bramce walidacyjnej i tych samych bramkach merge.

Przed przyjęciem praca jest kształtowana: `om-brainstorm` zamienia pojedynczy pomysł lub pytanie w decyzję o dalszej drodze i brief, a skille specyfikacji (`om-spec-writing`, `om-auto-write-spec`) zamieniają funkcję w dokument projektowy w `.ai/specs/`, zanim cokolwiek zostanie zbudowane. Te kroki zasilają tabelę poniżej; nie są samym przepływem zgłoszeń. Wymagania produktu opisuje `.ai/specs/product-brief.md`.

## Role

- **Autor** — człowiek lub agent, który pisze zmianę. Odpowiada za zgłoszenie od przejęcia do PR gotowego do merge.
- **Recenzent** — czyta diff i zatwierdza albo prosi o zmiany. Może to być człowiek lub skill `om-auto-review-pr`; w obu przypadkach obowiązuje checklista `om-code-review` oraz `CODE_REVIEW.md`. Recenzent jest też drugą osobą wymaganą przy zmianie `risk-high` i zatwierdza specyfikację, gdy funkcja jej wymaga.
- **Projektant** — odpowiada za przepływ i jego stany, zanim powstanie kod, oraz za kontrakt projektowy, do którego wraca review UI. Może to być człowiek, `om-ux-shape` przy kształtowaniu, `om-ux-review-pr` przy przeglądzie ekranów w PR.
- **Recenzent QA** — sprawdza zmiany widoczne dla użytkownika przed merge: `om-prepare-test-env` raz uruchamia aplikację, `om-auto-qa-pr` przechodzi ją w prawdziwej przeglądarce. „Ręcznie” oznacza, że wynik ocenia człowiek i to on nadaje `qa-approved`; nie oznacza pracy bez wsparcia. Zawsze wskazywany przez rolę, nigdy z imienia ani nicku — przydziały się zmieniają.
- **Maintainer** — odpowiada za ochronę gałęzi, taksonomię etykiet, konfigurację, ten dokument oraz zainstalowane skille z ich lokalnymi nadpisaniami w `.ai/skills/`; rozstrzyga konflikty bramek. Pełni rolę release managera, dopóki zespół nie wskaże innej osoby.

## Cykl życia zgłoszenia

| Etap | Co się dzieje | Kto prowadzi | Gotowe, gdy |
|---|---|---|---|
| Discovery | Pomysł, pytanie lub potrzeba zostaje omówiona, zanim powstanie jakikolwiek artefakt: problem jest kwestionowany, alternatywy (łącznie z niebudowaniem niczego) są ważone, a rozmowa kończy się decyzją — odpowiedzią, zgłoszeniem, briefem do specyfikacji albo bezpośrednią zmianą. | `om-brainstorm` lub człowiek | Rozmowa rozstrzygnięta; brief zapisany, gdy praca idzie dalej |
| Przyjęcie | Zgłoszenie lub brief trafia do GitHuba z wystarczającą ilością szczegółów: co jest nie tak lub czego brakuje, dla kogo i jak wygląda „gotowe”. `om-prepare-issue` zakłada je z etykietami SDLC. | Każdy, `om-prepare-issue` | Zgłoszenie istnieje |
| Triage | Potwierdzenie, że problem jest prawdziwy, wciąż nienaprawiony na `main` i nieprzejęty ani nieobjęty otwartym PR. Tylko odczyt; zatrzymuje łańcuch, gdy nie ma nic do zrobienia. | `om-verify-in-repo` lub człowiek | Potwierdzone do działania albo zamknięte bez akcji |
| Przejęcie | Autor przejmuje zgłoszenie, żeby inni agenci się wycofali. Zob. protokół przejęcia niżej. | `om-fix` / `om-auto-create-pr` lub człowiek | Przejęcie widoczne na zgłoszeniu |
| Projekt | Dla zmiany widocznej dla gracza lub w panelu przepływ i jego stany są ustalone przed kodem: co ekran robi pusty, w trakcie ładowania, przy błędzie i bez uprawnień, oraz czego zmiana celowo nie robi. Zgłoszenie bez UI pomija ten etap. | `om-ux-shape` lub projektant | Przepływ i stany ustalone albo zmiana nie dotyczy UI |
| Implementacja | Wskazanie minimalnej powierzchni zmiany (`om-root-cause`, tylko odczyt), potem implementacja z testami regresji (100% pokrycia testami jednostkowymi — `AGENTS.md`, sekcja „Testy”) i uruchomienie bramki walidacyjnej. Zadania bez zgłoszenia idą przez `om-auto-create-pr`, który planuje, implementuje fazami w izolowanym worktree i uruchamia tę samą bramkę. | `om-root-cause` + `om-fix`, `om-auto-create-pr` lub autor-człowiek | Zmiana kompletna, bramka zielona |
| PR | Commit, push i PR do `main` ze znormalizowanymi etykietami. Na gałęzi prowadzonej ręcznie `om-check-and-commit` uruchamia bramkę, naprawia oczywiste rozjazdy i pushuje, gdy jest zielono. | `om-open-pr`, `om-auto-create-pr` lub `om-check-and-commit` | Otwarty, oetykietowany PR |
| Pętla review | Recenzent czyta diff według checklisty `om-code-review` i `CODE_REVIEW.md`, po czym zatwierdza albo prosi o zmiany. Uwagi są adresowane (`om-auto-continue-pr` wznawia PR-y agentów z planu, a PR bez planu przejmuje, odtwarzając plan z kontekstu PR), a PR wraca do review aż do zatwierdzenia. Zmiana widoczna dla użytkownika dostaje też przegląd projektowy: `om-ux-review-pr` przechodzi zmienione ekrany i raportuje uwagi według wpływu na użytkownika. Ten przegląd jest doradczy — informuje review, nie blokuje merge. | `om-auto-review-pr` (jeden PR), `om-review-prs` (wszystkie), `om-ux-review-pr` (projekt) lub człowiek | Zatwierdzające review wysłane |
| QA | PR z `needs-qa` czeka na QA. Recenzent raz uruchamia aplikację przez `om-prepare-test-env`, przechodzi zmianę w prawdziwej przeglądarce przez `om-auto-qa-pr` — który dołącza zrzuty ekranu i raport pass/fail i domyślnie nie rusza etykiet — i zapisuje wynik. Przepływ wart zachowania staje się testem w `tests/integration` (`om-integration-tests`). Zob. bramkę QA niżej. | Recenzent QA z `om-prepare-test-env`, `om-auto-qa-pr`, `om-integration-tests` | `qa-approved` nadane przez recenzenta QA lub w dozwolonym wyjątku self-QA; `qa-failed` zawraca PR |
| Merge | `om-merge-buddy` raportuje (tylko odczyt), które PR-y można zmergować teraz, a które są blisko, ale zablokowane. `om-approve-merge-pr` ponownie sprawdza każdą bramkę, zatwierdza i robi squash-merge. | `om-merge-buddy` + `om-approve-merge-pr` lub człowiek | PR zmergowany (squash) do `main` |
| Po merge | Zamknięcie zgłoszeń naprawionych przez zmergowany PR; komentarz na zgłoszeniach, których PR zamknięto bez merge; zamiana pozostałych próśb i uwag z review w zgłoszenia uzupełniające. | `om-close-fixed-issues`, `om-followup-issue-from-pr` | Tracker uzgodniony, zgłoszenia uzupełniające założone |

Po merge ten proces się kończy. Wdrożenie, smoke testy, monitoring i rollback należą do procesu wydań repozytorium, nie do tego dokumentu: Maintainer (lub release manager, gdy zespół go wskaże) przygotowuje changelog przez `om-auto-update-changelog` i uzgadnia tracker przez `om-close-fixed-issues`, a `om-pipeline-retro` czyta zakończone przebiegi i szereguje koszty drugich podejść.

PR-y piszemy po polsku, więc obok angielskich słów kluczowych (`fixes`, `closes`, `resolves` przed `#N`) zamknięcie zgłoszenia oznaczają też `zamyka`, `naprawia` i `rozwiązuje` (`closeKeywords` w `.ai/agentic.config.json`).

## Maszyna stanów etykiet

Etykiety pipeline wykluczają się wzajemnie: PR ma co najwyżej jedną i wskazuje ona, gdzie PR jest w przepływie.

- Gotowy PR (nie draft) ma `review`.
- Recenzent go przesuwa: prośba o zmiany → `changes-requested`; po poprawkach wraca do `review`; zatwierdzenie → `merge-queue`.
- `merge-queue` to routing, nie dowód QA: PR z `needs-qa` może tam legalnie czekać, aż QA go zatwierdzi.
- Etykietę pipeline `qa` ustawia tylko recenzent QA. Przenosi PR z `needs-qa` z `merge-queue` do `qa` na czas testów, potem z powrotem do `merge-queue` z `qa-approved`, gdy przejdzie, albo do `qa-failed`, gdy nie. Skille automatyczne proszą o QA etykietą `needs-qa`; nigdy nie ustawiają `qa`.
- `blocked` i `do-not-merge` ustawiają i zdejmują ludzie; zatrzymują przepływ niezależnie od etapu.

| Grupa | Etykiety | Wyłączność | Znaczenie |
|---|---|---|---|
| Pipeline | `review`, `changes-requested`, `qa`, `qa-failed`, `merge-queue`, `blocked`, `do-not-merge` | jedna naraz | Stan w przepływie |
| Kategoria | `bug`, `feature`, `refactor`, `security`, `dependencies`, `documentation` | addytywne | Rodzaj zmiany |
| Meta | `needs-qa`, `skip-qa`, `qa-approved`, `qa-self-verified`, `in-progress`, `ci-monitoring` | addytywne | Sygnały procesu |
| Priorytet | `priority-low`, `priority-medium`, `priority-high`, `priority-extreme` | jedna naraz; brak = medium | Pilność pracy |
| Ryzyko | `risk-low`, `risk-medium`, `risk-high` | jedna naraz; brak = medium | Zasięg skutków zmiany |

Priorytet mówi, jak pilna jest praca; ryzyko — jak niebezpieczne jest jej wdrożenie. Jednolinijkowa poprawka awarii może być `priority-extreme` i `risk-low`; duży refaktor logowania, który może poczekać, może być `priority-low` i `risk-high`. PR dziedziczy oba po zgłoszeniu źródłowym, chyba że zakres wyraźnie się zmienił. Gdy skill automatyczny dodaje lub zmienia etykietę pipeline albo meta, zostawia krótki komentarz z uzasadnieniem.

Bez etykiety priorytetu przyjmij:

- `priority-extreme` — awaria produkcji, utrata danych (partie, historia) lub aktywny incydent bezpieczeństwa.
- `priority-high` — wzmocnienie bezpieczeństwa lub regresja blokująca wydanie.
- `priority-medium` — zwykłe poprawki błędów i nowe funkcje (także domyślne odczytanie braku etykiety).
- `priority-low` — kosmetyka, tylko dokumentacja, podbicia zależności, porządki.

Bez etykiety ryzyka przyjmij:

- `risk-high` — logowanie i sesje, uprawnienia uczestnika partii i panelu `/backend`, stan partii i zegar rozstrzygane po stronie serwera, przepływy wrażliwe na wyścigi (ruch, dołączenie do partii, przyjęcie zaproszenia, wybór z lobby), migracje schematu, wspólne powierzchnie kontraktu albo szerokie, przekrojowe zmiany.
- `risk-medium` — zwykła zmiana w jednym obszarze z testami (także domyślne odczytanie braku etykiety).
- `risk-low` — tylko dokumentacja, tylko testy, literówki, izolowana kosmetyka.

Przy sprzecznych sygnałach wybierz wyższą etykietę i uzasadnij to w komentarzu do etykiet. PR `risk-high` nie tylko „zasługuje na więcej uwagi” — uruchamia bramki:

| Obszar `risk-high` | Co PR musi zawierać |
|---|---|
| Logowanie, sesje, uprawnienia | test integracyjny ścieżki odmowy i odczytu cudzego rekordu (partii, wpisu w lobby); review drugiej osoby |
| Stan partii, zegar, wyścigi | testy jednostkowe zasad/zegara w `core` oraz test integracyjny przypadku współbieżnego (podwójny ruch, dwóch graczy wybiera ten sam wpis z lobby, podwójne przyjęcie zaproszenia) |
| Migracje schematu | migracja sprawdzona w górę i w dół na prawdziwym PostgreSQL oraz plan wycofania w opisie PR |
| Wspólne powierzchnie kontraktu | strona konsumująca sprawdzona zgodnie z `BACKWARD_COMPATIBILITY.md` |
| Każde `risk-high` | `needs-qa`, gdy zmiana jest widoczna dla użytkownika; bez self-QA; `om-code-review` blokuje bez powyższych dowodów, chyba że maintainer zrezygnuje z nich wprost w PR |

Jedna etykieta jest poza tą taksonomią: `do-not-close` — nadają ją ludzie zgłoszeniom, których skille porządkowe nigdy nie mogą zamknąć automatycznie. Skille ją tylko czytają.

## Bramka QA

Jedyna twarda reguła tego procesu: **PR z `needs-qa` nie może zostać zmergowany, dopóki nie ma też `qa-approved`, nawet jeśli wszystkie inne sprawdzenia są zielone.** `om-merge-buddy` klasyfikuje taki PR jako zablokowany; `om-approve-merge-pr` odmawia merge.

- `needs-qa` nadawaj zmianom UI (strony graczy i panel `/backend`), nowym funkcjom i innemu zachowaniu widocznemu dla użytkownika, które trzeba przećwiczyć ręcznie.
- Dla zmiany UI QA to więcej niż „działa”: macierz stanów (domyślny, pusty, ładowanie, błąd, brak uprawnień, długa treść, wąski ekran) należy do oceny pass/fail, podobnie jak zgodność z kontraktem projektowym w `.uxproof/`, gdy repozytorium go ma. Brakujący stan oblewa QA. `om-ux-review-pr` pozostaje doradczym przeglądem projektu; jego obiektywne sprawdzenia wykonuje QA.
- `skip-qa` to jawna rezygnacja dla zmian tylko w dokumentacji, zależnościach, CI, testach i podobnych zmian o niskim ryzyku, niewidocznych dla użytkownika. Nigdy nie łącz jej z `needs-qa`.
- `qa-failed`, `do-not-merge` i `blocked` blokują twardo niezależnie od innych sygnałów. Aktywna etykieta pipeline `qa` oznacza, że tester właśnie pracuje nad PR — nigdy nie merguj pod aktywnym testerem.
- Bramka jest spełniona, gdy recenzent QA przetestuje PR i nada `qa-approved`.
- **`qa-approved` jest przypięte do commita.** Komentarz, który je nadaje — notatka recenzenta QA lub komentarz z dowodami self-QA — zawiera linię `QA head: <sha>` testowanego commita. Push po tej linii zostawia etykietę, ale ją unieważnia: `om-merge-buddy` raportuje „QA evidence older than head”, a `om-approve-merge-pr` prosi o potwierdzenie przed merge. Wyjście to ponowny test przez recenzenta QA albo stwierdzenie w PR, że nowe commity nie dotykają testowanego zakresu, z nową linią `QA head:`.
- **Wyjątek self-QA**: gdy żaden recenzent QA nie ma czasu, każdy inżynier — albo `om-auto-qa-pr --self-qa-signoff` — może zatwierdzić zamiast niego, tylko na PR `risk-low` lub `risk-medium`. Dowody w PR wskazują przećwiczony scenariusz, środowisko, dane testowe, zaobserwowany wynik, sprawdzone przypadki negatywne i linię `QA head:`. Wtedy nadaj obie etykiety: `qa-approved` (bramka przechodzi) i `qa-self-verified` (wyjątek jest audytowalny). Bez dowodów nie ma `qa-approved`.
- **Bez self-QA na `risk-high`.** PR z `risk-high` albo taki, którego diff dotyka logowania, sesji, uprawnień, stanu partii i zegara, migracji schematu lub wspólnych kontraktów (wnioskowanie `risk-high` wyżej), wymaga recenzenta QA albo jawnego wyjątku maintainera zapisanego w PR; `om-auto-qa-pr` wstrzymuje wtedy zatwierdzenie i publikuje tylko dowody. Zmiana logowania lub uprawnień wymaga też review drugiej osoby niezależnie od ścieżki QA.

## Protokół przejęcia

Zanim agent zmieni zgłoszenie lub PR, przejmuje je wszystkimi trzema sygnałami: przypisuje się, dodaje etykietę `in-progress` i publikuje komentarz z informacją, co robi. Agent, który znajdzie istniejące przejęcie, wycofuje się zamiast kolidować. PR z `in-progress` jest też pomijany przez narzędzia merge.

`in-progress` oznacza **aktywną pracę**. Gdy praca agenta jest skończona i w pełni zaraportowana — etykiety nadane, review wysłane, komentarze opublikowane — agent zamienia `in-progress` na `ci-monitoring`, jeśli zamierza jeszcze zaraportować wynik CI. `ci-monitoring` **nie jest** przejęciem i nikogo nie blokuje: mówi tylko, że komentarz z wynikiem CI jest jeszcze należny, więc inny agent lub człowiek może swobodnie działać na PR. Etykieta znika, gdy pojawi się komentarz z wynikiem, albo gdy agent przestaje czekać po `ci.maxWaitMinutes` i mówi o tym wprost.

Przejęcie jest zwalniane, gdy praca się kończy — zarówno po sukcesie, jak i po porażce. Nieaktualne `in-progress` bez świeżej aktywności może usunąć maintainer.

### Raportowanie niezależne od CI

Agenci nadają etykiety, wysyłają review i publikują komentarze **od razu po zakończeniu pracy**, bez czekania na zielone CI. Review wysłane, gdy sprawdzenia jeszcze trwają, mówi o tym w treści: merge i tak blokują ochrona gałęzi i bramka QA, a zatwierdzenie dotyczy kodu, nie zielonego przebiegu. Wynik CI przychodzi potem jako komentarz uzupełniający, który koryguje też etykietę pipeline, jeśli wynik zmienia werdykt.

Czekanie na wynik ogranicza `ci.maxWaitMinutes` (domyślnie 40). Gdy limit minie, a sprawdzenia wciąż trwają, agent przestaje czekać, uruchamia lokalną bramkę walidacyjną jako własny dowód, publikuje go razem z nazwami trwających sprawdzeń i jasną informacją, że kolejnego komentarza nie będzie, zdejmuje `ci-monitoring` i kończy.

Czerwony sygnał też nie skraca review. Nieprzechodzące wymagane sprawdzenie lub konflikt są zbierane jako **uwaga blokująca** i raportowane razem z pełnym review kodu, nigdy zamiast niego: jeden cykl review daje autorowi nieprzechodzące sprawdzenie, konflikt i wszystkie uwagi do kodu naraz. Taki werdykt to nadal `changes-requested`.

Nic z tego nie zmienia bramek merge. Wczesne raportowanie jest bezpieczne; wczesny merge — nie. Wymagane sprawdzenia nadal blokują każdy merge, a narzędzia merge odmawiają, dopóki nie są naprawdę zielone.

## Kontrakt automatyzacji

Skille `om-auto-*` prowadzą ten proces bez nadzoru i dają się łączyć w łańcuchy: każdy przyjmuje artefakt wytworzony przez poprzedni (numer zgłoszenia, ścieżkę specyfikacji albo numer PR z linii `PR: #<number> (link: <url>)`, którą emituje każdy skill tworzący PR) i wykrywa już rozpoczętą pracę — otwarty PR odwołujący się do zgłoszenia lub planu — kontynuując ją zamiast otwierać duplikat. Zakończony przebieg autonomiczny zostawia **gotowy** (nie draft), w pełni oetykietowany PR — jedna etykieta pipeline, kategoria, meta QA, jeden priorytet, jedno ryzyko — z komentarzem podsumowującym przebieg, a dla zmian widocznych dla użytkownika ze zrzutami ekranu z działającej aplikacji jako dowodem w PR. Draft PR-y są zarezerwowane dla stanów jawnie niekompletnych: PR-ów tylko ze specyfikacją, przerwanych przekazań albo domyślnych decyzji autonomicznych oznaczonych do potwierdzenia przez człowieka. Automatyzacja nadaje `qa-approved` tylko przez wyjątek self-QA (`om-auto-qa-pr --self-qa-signoff`, zawsze razem z `qa-self-verified`, nigdy na PR `risk-high`); żaden skill autorski, review ani merge nigdy jej nie nadaje.

Przebiegi autonomiczne są logowane w `.ai/runs/` (zasada 10 w `AGENTS.md`).

## Bramka walidacyjna

Każdy PR przechodzi pełną bramkę walidacyjną przed zatwierdzeniem review, w tej kolejności:

- `npm run lint`
- `npm run typecheck`
- `npm test` — testy jednostkowe z progiem 100% pokrycia dla każdego pliku
- `npm run build`
- `npm run test:integration` — testy integracyjne (Testcontainers + agent-browser); wymaga Dockera

Każdy niezerowy kod wyjścia oblewa bramkę i blokuje PR. Skille implementujące uruchamiają bramkę przed otwarciem PR, a `om-check-and-commit` — przed pushem gałęzi prowadzonej ręcznie. Te same kroki wykonuje lokalnie `npm run check`, a na każdym PR — CI (`.github/workflows/ci.yml`). Lista komend jest w `.ai/agentic.config.json`; gdy się zmienia, zaktualizuj ją tam i w tej sekcji jednocześnie.

## Zmiany tego procesu

Ten dokument i `.ai/agentic.config.json` opisują ten sam proces: zmieniaj je razem i uruchom ponownie skill `om-setup-agent-pipeline`, gdy zmienia się zestaw narzędzi lub taksonomia etykiet.

Kontrakt projektowy, który czytają etapy Projekt i Review, powstaje raz: `om-ux-setup` wyciąga go z repozytorium i jest uruchamiany ponownie, gdy zmienia się design system.

Odstępstwa dla pojedynczych skilli — dodatkowe reguły review, inny szablon opisu PR, dodatkowy krok bramki — należą do lokalnego skilla o tej samej nazwie w `.ai/skills/<skill-name>/SKILL.md`, który ma pierwszeństwo przed zainstalowanym skillem (i może go importować przez `@`, żeby go rozszerzyć zamiast zastąpić). Reguły lokalne wygrywają, ale lokalny skill nie może dać tego, czego zabraniają reguły bezpieczeństwa zainstalowanego skilla.
