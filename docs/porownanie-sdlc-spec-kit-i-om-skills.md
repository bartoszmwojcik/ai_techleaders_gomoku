# Spec Kit a skille Open Mercato — porównanie dwóch podejść do SDLC z agentami AI

Stan na 3 listopada 2026. Źródła: [github/spec-kit](https://github.com/github/spec-kit) w wersji 1.2.6 (commit `ba8363f`, 2 listopada 2026: `README.md`, `spec-driven.md`, `templates/`, `workflows/`, `extensions/`) oraz skille `om-*` z [open-mercato/skills](https://github.com/open-mercato/skills) zainstalowane w tym repozytorium (`.agents/skills/`, wersje w `skills-lock.json`) razem z ich konfiguracją (`SDLC.md`, `.ai/agentic.config.json`).

## TL;DR

- **Spec Kit** stawia w centrum **specyfikację**. Specyfikacja jest źródłem prawdy, a kod jest jej „wygenerowanym wynikiem”. Proces to łańcuch artefaktów jednej funkcji: `constitution → specify → (clarify) → plan → tasks → (analyze) → implement → converge`. Kończy się na działającym kodzie w drzewie roboczym. PR, review, QA, merge i tracker są poza rdzeniem (opcjonalne rozszerzenia `git` i `github`).
- **Skille Open Mercato** stawiają w centrum **przepływ dostarczania**: zgłoszenie → PR → review → QA → merge → porządki po merge. Specyfikacja to jeden etap (`om-spec-writing`, `om-auto-write-spec`), nie oś procesu. Stan pracy żyje w trackerze (etykiety jako maszyna stanów, protokół przejęcia), a skille są projektowane pod pracę autonomiczną wielu agentów naraz.
- Krótko: **Spec Kit odpowiada na pytanie „co i jak zbudować”, a OM na pytanie „jak to bezpiecznie dowieźć do `main`”.** Podejścia bardziej się uzupełniają niż konkurują. Najwięcej zyskuje się, biorąc oś dostarczania z OM i dyscyplinę specyfikacji ze Spec Kit (rekomendacje na końcu).

## 1. Filozofia

| | Spec Kit | Skille OM |
| --- | --- | --- |
| Teza | „Specyfikacje stają się wykonywalne”: kod jest ostatnią milą, utrzymanie oprogramowania to ewolucja specyfikacji (`spec-driven.md`) | Proces dostarczania zapisany jako kontrakt (`SDLC.md`), egzekwowany przez łańcuch skilli; każda zmiana kończy się gotowym, oetykietowanym PR |
| Jednostka pracy | Funkcja (katalog `specs/NNN-feature/`) | Zgłoszenie lub PR (numer w GitHubie), przebieg w `.ai/runs/` |
| Źródło prawdy | `spec.md` + `plan.md` + `tasks.md` + konstytucja | Tracker (etykiety, komentarze, review) + specyfikacje w `.ai/specs/` + `AGENTS.md` |
| Domyślny tryb | Człowiek w pętli: „uruchamiaj komendy po kolei, przeglądając każdy wynik” | Autonomia: skille `om-auto-*` działają bez nadzoru, a decyzje domyślne publikują do akceptacji |
| Model użytkownika | Jeden developer + jeden agent na gałęzi funkcji | Zespół ludzi i wielu agentów równolegle na wspólnym trackerze |

## 2. Cykl życia — mapowanie etapów

| Etap | Spec Kit | Skille OM |
| --- | --- | --- |
| Odkrywanie pomysłu | Rozszerzenie `assess`: `intake → research → define → shape → decide`, werdykt `go` / `needs-clarification` / `kill` | `om-brainstorm`, `om-discover` (brief produktu), `om-synthetic-users`, `om-mockup-prototype`, `om-ux-shape` |
| Zasady projektu | `/speckit-constitution` → `.specify/memory/constitution.md`, wersjonowana, z bramką „Constitution Check” w planie | `AGENTS.md`, `.ai/docs/…-engineering-standards.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`; konfiguracja generowana przez `om-setup-agent-pipeline` |
| Backlog | Rozszerzenie `github`: `tasks.md` → zgłoszenia `T001: …` | `om-backlog` (epiki, historie, zadania z brief/spec), `om-prepare-issue`, `om-auto-manage-issues` (Definition of Ready) |
| Specyfikacja | `/speckit-specify` (historie z priorytetem P1/P2/P3, `FR-xxx`, mierzalne kryteria sukcesu, znaczniki `[NEEDS CLARIFICATION]`), `/speckit-clarify`, `/speckit-checklist` („testy jednostkowe dla języka naturalnego”) | `om-spec-writing` (szkielet najpierw, twarda bramka Open Questions, research rynku, ryzyka, fazy i kroki), recenzja w formacie „staff engineer”; `om-auto-write-spec` ląduje spec na PR do zatwierdzenia |
| Plan techniczny | `/speckit-plan` → `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` | Sekcje Architecture / Data Model / API Contracts / Phasing / Implementation Plan w tej samej specyfikacji |
| Rozbicie na zadania | `/speckit-tasks` → `tasks.md` (`T001`, znacznik `[P]` dla zadań równoległych, `[US1]` dla historii) | `PLAN.md` w folderze przebiegu (`om-auto-create-pr-loop`), postęp jako tabela kroków |
| Spójność artefaktów | `/speckit-analyze`: tylko odczyt, duplikaty, niejasności, pokrycie wymagań, naruszenia konstytucji = CRITICAL | Recenzja specyfikacji w `om-auto-review-pr` (dla PR-ów tylko ze spec); brak osobnej kontroli spec↔plan↔zadania |
| Implementacja | `/speckit-implement` wykonuje `tasks.md` | `om-auto-create-pr` / `-loop` (izolowany worktree, commit na krok, punkty kontrolne co ~5 kroków), `om-auto-implement-spec`, `om-fix` |
| Zgodność kodu ze spec | `/speckit-converge`: porównuje kod z intencją spec/plan/tasks, dopisuje brakujące zadania; powtarzaj aż do „Converged” | Pośrednio: review kodu, bramka walidacyjna, QA; brak automatycznego „spec vs kod” |
| Błędy | Rozszerzenie `bug`: `assess → fix → test`, werdykt `verified` / `partial` / `failed` | `om-auto-fix-issue`: `om-verify-in-repo → om-root-cause → om-fix → om-open-pr → om-auto-review-pr → om-auto-qa-pr` |
| PR i review | Poza rdzeniem (rozszerzenie `git`: gałęzie, auto-commit) | `om-open-pr`, `om-code-review`, `om-auto-review-pr` (z pętlą autofix), `om-review-prs`, `om-ux-review-pr` |
| QA | Brak (weryfikacja to `converge` i opcjonalne testy w `tasks.md`) | `om-prepare-test-env`, `om-auto-qa-pr` (prawdziwa przeglądarka, zrzuty, pass/fail), `om-qa-buddy`, `om-integration-tests`; bramka `needs-qa` → `qa-approved` przypięta do SHA |
| Merge i po merge | Brak | `om-merge-buddy`, `om-approve-merge-pr`, `om-close-fixed-issues`, `om-followup-issue-from-pr`, `om-auto-update-changelog` |
| Doskonalenie procesu | Brak wbudowanego | `om-pipeline-retro` (koszt drugich podejść), a w tym repo także `.ai/lessons/` |

Wniosek: Spec Kit ma bogatszą **lewą stronę** cyklu (od intencji do planu i zadań), a OM ma pełną **prawą stronę** (od kodu do `main` i z powrotem do trackera).

## 3. Kluczowe różnice

### 3.1. Gdzie żyje stan

- **Spec Kit** trzyma stan w plikach Markdown funkcji i w silniku workflow (`specify workflow run/status/resume`, utrwalone przejścia, wznawianie po przerwaniu). Nie wie nic o tym, czy kod trafił na `main`.
- **OM** trzyma stan w trackerze: wzajemnie wykluczające się etykiety pipeline (`review → changes-requested → merge-queue → qa → …`), etykiety ryzyka i priorytetu, przejęcie trzema sygnałami (assignee + `in-progress` + komentarz). Dzięki temu działa przy **wielu współbieżnych agentach**: agent, który znajdzie przejęcie, wycofuje się, a `om-auto-continue-pr` wznawia cudzy PR, rekonstruując plan z jego kontekstu.

### 3.2. Bramki jakości: deklaratywne a wykonywane

- **Spec Kit**: bramki są głównie **semantyczne i dokumentowe**. Konstytucja z „Constitution Check” (naruszenia trzeba uzasadnić w „Complexity Tracking”), `analyze` szukający niespójności, `checklist` testujący jakość wymagań, bramki `gate` (approve/reject) w workflow YAML. Testy w `tasks.md` są domyślnie **opcjonalne** („only if tests requested”).
- **OM**: bramki są **wykonywane i twarde**. Komendy walidacji z `agentic.config.json` (tu: lint, typecheck, testy ze 100% pokrycia, build, testy integracyjne), CI jako warunek merge, bramka QA z dowodem przypiętym do commita (`QA head: <sha>`), dodatkowe wymagania dla `risk-high` (np. migracja w górę i w dół na PostgreSQL, test współbieżności, review drugiej osoby), zakaz self-QA dla `risk-high`.

### 3.3. Człowiek w pętli

- **Spec Kit** domyślnie zakłada przegląd po każdym kroku; automatyzację daje silnik workflow z jawnymi bramkami. Człowiek zatwierdza **artefakty** (spec, plan).
- **OM** zakłada autonomię i przenosi człowieka na **punkty decyzyjne o ryzyku**: zatwierdzenie specyfikacji na osobnym PR, `qa-approved`, wyjątki maintainera, etykiety `blocked`/`do-not-merge`. Decyzje podjęte domyślnie w trybie autonomicznym są publikowane do potwierdzenia.

### 3.4. Przenośność i rozszerzalność

- **Spec Kit** to produkt z CLI (`specify`, Python 3.11+, `uv`) i ekosystemem: 43 integracje z agentami w katalogu (Copilot, Claude, Gemini, Codex i inne), **presety** (np. wymogi regulacyjne, governance architektury), **rozszerzenia** z hookami `before_*/after_*`, **workflowy** z overlayami, **bundle** dla ról, katalogi prywatne, praca offline. Warstwy da się prześledzić (inventory artefaktów).
- **OM** to kolekcja skilli (`SKILL.md`) instalowanych do repozytorium i przypiętych hashami w `skills-lock.json`. Rozszerzalność jest prostsza: lokalny skill w `.ai/skills/<nazwa>/SKILL.md` ma pierwszeństwo przed zainstalowanym (tu: `om-prepare-test-env`), konfiguracja w jednym JSON-ie, abstrakcje trackera (`.ai/trackers/github.md`) i przeglądarki (`.ai/browsers/`), aktualizacje przez `om-apply-upgrade-notes`. W praktyce proces jest mocno związany z modelem PR/zgłoszeń w stylu GitHuba.

### 3.5. Ślad wymagań

- **Spec Kit** daje jawny łańcuch: historia (P1) → `FR-006` → `T012 [US1]` → wynik `converge`. Łatwo zapytać „które wymaganie nie ma pokrycia”.
- **OM** daje ślad organizacyjny: zgłoszenie → spec → PR → review → QA → merge (słowa zamykające, także polskie `zamyka`/`naprawia`/`rozwiązuje`). Ślad „wymaganie → kod” jest słabszy: kryteria akceptacji odhacza autor przy weryfikacji (`AGENTS.md`, krok 4).

## 4. Mocne i słabe strony

| | Spec Kit | Skille OM |
| --- | --- | --- |
| Mocne | Niski próg wejścia (6 komend); dyscyplina wymagań (`[NEEDS CLARIFICATION]`, mierzalne kryteria, priorytety historii); `analyze` i `converge` wykrywają dryf; niezależność od agenta i trackera; dojrzały ekosystem i governance dla organizacji | Pełny cykl aż do `main` i porządków po merge; twarde, wykonywane bramki; praca wielu agentów (przejęcia, wznawianie, worktree); dowody QA z prawdziwej przeglądarki; jawne zarządzanie ryzykiem; pętla uczenia się (retro, lekcje) |
| Słabe | Brak PR/review/QA/merge w rdzeniu, więc „gotowe” znaczy „zgodne ze spec”, a nie „na produkcji”; duża liczba dokumentów na funkcję; testy opcjonalne; specyfikacje po wdrożeniu łatwo się rozjeżdżają (osobny przewodnik „evolving specs”); nastawienie na greenfield | Wysoki koszt konfiguracji i nauki (40+ skilli, taksonomia etykiet); związanie z GitHubem i PR-ami; szum etykiet i komentarzy; specyfikacja mniej sformalizowana (brak ID wymagań i automatycznej kontroli pokrycia); brak odpowiednika `converge` |
| Najlepiej pasuje do | Nowej funkcji lub produktu, gdzie największe ryzyko to „źle zrozumiane wymagania” | Działającego repozytorium z CI i zespołem, gdzie największe ryzyko to „zepsuty `main`” i koordynacja wielu agentów |

## 5. Jak to wygląda w tym repozytorium

Gomoku używa OM jako osi procesu: `SDLC.md` i `.ai/agentic.config.json` wygenerował `om-setup-agent-pipeline`, w `.ai/specs/implemented/` jest 47 wdrożonych specyfikacji, w `.ai/runs/` 15 logów przebiegów autonomicznych, a `.ai/lessons.md` indeksuje lekcje. Elementy przypominające Spec Kit są już obecne, ale rozproszone:

- rolę **konstytucji** pełnią `AGENTS.md` (sekcja „Stack i architektura” jest wiążąca) i standardy inżynierskie;
- rolę **clarify** pełni bramka Open Questions w `om-spec-writing` oraz skill `grill-me` (lekcja o spójności specyfikacji auth);
- rolę **tasks** pełni `PLAN.md` przebiegu i backlog z `om-backlog`.

## 6. Rekomendacje

Nie zalecam migracji na Spec Kit: zastąpiłby on tylko lewą połowę cyklu, a prawą (PR, QA, merge), która tutaj działa i jest egzekwowana przez CI, trzeba by odtwarzać. Warto natomiast przenieść trzy praktyki Spec Kit do skilli OM jako lokalne nadpisania (`.ai/skills/<skill>/SKILL.md`), bez zmiany zainstalowanych skilli:

1. **Identyfikatory wymagań i znaczniki niejasności w specyfikacji.** W `om-spec-writing` wymagać numerowanych wymagań (`FR-xxx`) i mierzalnych kryteriów akceptacji, a otwarte kwestie oznaczać `[NEEDS CLARIFICATION]` zamiast prozy. Pozwala to automatycznie sprawdzić, czy spec jest gotowa do implementacji.
2. **Kontrola „spec vs kod” przed przeniesieniem do `implemented/`** (odpowiednik `converge`). Krok w `om-auto-implement-spec` lub `om-auto-review-pr`: dla każdego `FR-xxx` wskazać kod i test, który go pokrywa, a luki raportować jako uwagę blokującą. To domyka największą słabość OM: brak śladu wymaganie → kod.
3. **Jawny „Constitution Check” w specyfikacji.** Sekcja, w której spec deklaruje zgodność z zasadami z `AGENTS.md` (granice pakietów, DI, migracje, 100% pokrycia), a każde odstępstwo uzasadnia. Recenzja specyfikacji traktuje niezadeklarowane naruszenie jako blokujące.

W odwrotnym kierunku, czyli w projekcie opartym na Spec Kit, brakujące elementy OM (bramka QA przypięta do commita, etykiety ryzyka, protokół przejęcia) da się dodać jako rozszerzenie z hookami `after_implement` i `after_converge` albo jako własny workflow z krokami `gate`. To jednak wymaga zbudowania sporej części tego, co OM daje od razu.
