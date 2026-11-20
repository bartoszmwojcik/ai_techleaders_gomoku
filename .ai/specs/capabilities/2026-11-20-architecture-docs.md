# Capability: architecture-docs

Właściciel, nowe osoby i agenci poznają system od kontekstu (L1) do modelu danych w modelu LikeC4, który CI trzyma w zgodzie z kodem.

## Requirement: Model architektury jest zgodny z kodem
The system SHALL fail the CI job `architecture` when the LikeC4 model in `docs/architektura/*.c4` and the code disagree on workspace packages, DI registrations in `container.ts` or entities in `entities/index.ts`.

### Scenario: Brakujący element modelu
- WHEN PR dodaje rejestrację do `container.ts`, encję do `entities/index.ts` albo pakiet do `packages/` bez odpowiadającego elementu w `docs/architektura/*.c4`
- THEN job `architecture` kończy się błędem z nazwą brakującej pozycji

### Scenario: Element wskazujący nieistniejącą pozycję
- WHEN model zawiera element z metadanymi wskazującymi nieistniejącą rejestrację, encję lub pakiet
- THEN job `architecture` kończy się błędem

Source: .ai/specs/implemented/2026-11-20-architecture-likec4.md

## Requirement: Strona architektury jest publikowana z `main`
The system SHALL publish the LikeC4 site built from `main` on GitHub Pages, with click-through navigation from each L1/L2 element to its lower-level view.

### Scenario: Publikacja
- WHEN commit trafia na `main` i Pages jest włączone
- THEN `pages-deploy` publikuje aktualną stronę LikeC4

### Scenario: Zagłębianie
- WHEN element L1/L2 ma widok niższego poziomu
- THEN kliknięcie elementu otwiera ten widok

Source: .ai/specs/implemented/2026-11-20-architecture-likec4.md

## Requirement: Klasyfikacja zakresu CI (`scripts/ci/scope.mjs`)
The system SHALL classify changed files into `code` (heavy jobs) and, independently, `arch` (job `architecture`).

### Scenario: Sama dokumentacja
- WHEN PR zmienia wyłącznie Markdown poza `docs/architektura/`
- THEN `code=false` i `arch=false`

### Scenario: Model albo test zgodności
- WHEN PR zmienia plik pod `docs/architektura/` albo `scripts/architecture/`
- THEN `arch=true`, a reguła `code` działa jak dotąd (`docs/architektura/**` to dokumentacja, `scripts/architecture/**` to kod)

Source: .ai/specs/implemented/2026-11-20-architecture-likec4.md
