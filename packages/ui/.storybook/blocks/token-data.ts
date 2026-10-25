export type ColorToken = {
  token: string;
  role: string;
  source: string;
  use: string;
  avoid: string;
};

export const COLOR_TOKENS: readonly ColorToken[] = [
  { token: "surface-page", role: "Tło strony", source: "R01.1, Z3", use: "tło strony", avoid: "tło planszy" },
  { token: "surface-raised", role: "Panel nad tłem", source: "tokeny.md (propozycja przyjęta)", use: "panele, wiersze list", avoid: "tło strony" },
  { token: "surface-overlay", role: "Tło za dialogiem", source: "propozycja (bez rozmycia, A02)", use: "tło za dialogiem", avoid: "panele i karty" },
  { token: "text-primary", role: "Tekst główny", source: "R01.2, R02.2", use: "tytuły, tekst główny", avoid: "tekst pomocniczy" },
  { token: "text-secondary", role: "Tekst drugiego poziomu", source: "R01.2", use: "opisy pod tytułem", avoid: "tytuły" },
  { token: "text-muted", role: "Tekst pomocniczy", source: "R01.8", use: "linia meta, podpisy", avoid: "tekst na akcjach" },
  { token: "text-accent", role: "Tekst interaktywny", source: "R02.3, Z1", use: "linki w tekście", avoid: "nagłówki, tekst statyczny" },
  { token: "action-primary-bg", role: "Tło głównego przycisku", source: "R02.1, R02.3", use: "tło głównego przycisku", avoid: "tekst, ikony dekoracyjne" },
  { token: "action-primary-bg-hover", role: "Główny przycisk po najechaniu", source: "R02.3", use: "najechanie na główny przycisk", avoid: "stan domyślny" },
  { token: "action-primary-bg-pressed", role: "Główny przycisk wciśnięty", source: "propozycja (wciśnięty = ciemniejsze wypełnienie)", use: "wciśnięcie głównego przycisku", avoid: "stan domyślny" },
  { token: "action-primary-text", role: "Tekst na głównym przycisku", source: "R02.3, R01.8", use: "tekst na action-primary-bg", avoid: "inne tła" },
  { token: "action-danger-bg", role: "Tło akcji destrukcyjnej", source: "propozycja (Q4)", use: "usunięcie konta, rezygnacja z partii", avoid: "zwykłe akcje" },
  { token: "action-danger-bg-hover", role: "Akcja destrukcyjna po najechaniu", source: "propozycja (Q4)", use: "najechanie na akcję destrukcyjną", avoid: "stan domyślny" },
  { token: "action-danger-bg-pressed", role: "Akcja destrukcyjna wciśnięta", source: "propozycja (wciśnięty = ciemniejsze wypełnienie)", use: "wciśnięcie akcji destrukcyjnej", avoid: "stan domyślny" },
  { token: "action-danger-text", role: "Tekst na akcji destrukcyjnej", source: "propozycja (Q4)", use: "tekst na action-danger-bg", avoid: "inne tła" },
  { token: "focus-ring", role: "Obrys fokusu", source: "R01.8", use: "obrys 2 px z odstępem 2 px", avoid: "wypełnienie" },
  { token: "border-default", role: "Podział treści", source: "R02.4", use: "dekoracyjny podział", avoid: "brzegi pól formularza" },
  { token: "border-control", role: "Brzeg kontrolki", source: "R01.8", use: "pola, przyciski drugorzędne", avoid: "dekoracyjne podziały" },
  { token: "status-success", role: "Stan: powodzenie", source: "propozycja (Q4)", use: "tekst, ikona i obramowanie przy słowie „sukces” lub „wygrana”", avoid: "jedyny nośnik znaczenia" },
  { token: "status-warning", role: "Stan: uwaga", source: "propozycja (Q4)", use: "tekst, ikona i obramowanie przy ostrzeżeniu", avoid: "jedyny nośnik znaczenia" },
  { token: "status-danger", role: "Stan: błąd", source: "propozycja (Q4)", use: "tekst, ikona i obramowanie przy błędzie lub porażce", avoid: "jedyny nośnik znaczenia" },
  { token: "status-info", role: "Stan: informacja", source: "propozycja (Q4)", use: "tekst, ikona i obramowanie przy informacji lub remisie", avoid: "jedyny nośnik znaczenia" },
  { token: "board-surface", role: "Tło planszy", source: "R01.4", use: "tło planszy", avoid: "tło strony" },
  { token: "board-line", role: "Linie siatki", source: "R01.4", use: "linie siatki", avoid: "obrysy kamieni" },
  { token: "board-grain", role: "Słoje planszy", source: "R01.5", use: "tekstura planszy", avoid: "elementy poza planszą" },
  { token: "board-marker", role: "Ostatni ruch i linia wygrywająca", source: "propozycja (R01.8: akcja ma ok. 2,5:1 na planszy)", use: "obrys ostatniego ruchu i linii wygrywającej", avoid: "elementy poza planszą" },
  { token: "piece-black", role: "Czarny kamień", source: "R01.3", use: "czarny kamień", avoid: "tło strony" },
  { token: "piece-white", role: "Biały kamień", source: "R01.3", use: "biały kamień", avoid: "tekst" },
  { token: "piece-outline", role: "Obrys kamienia", source: "R01.8", use: "obrys obu kolorów kamieni, 1 px", avoid: "linie siatki" },
];

/** "text" needs 4.5:1, "ui" needs 3:1, "decor" has no requirement (decorative separators). */
export type PairKind = "text" | "ui" | "decor";

export type ContrastPair = {
  fg: string;
  bg: string;
  kind: PairKind;
  note?: string;
};

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: "text-primary", bg: "surface-page", kind: "text" },
  { fg: "text-primary", bg: "surface-raised", kind: "text" },
  { fg: "text-secondary", bg: "surface-page", kind: "text" },
  { fg: "text-secondary", bg: "surface-raised", kind: "text" },
  { fg: "text-muted", bg: "surface-page", kind: "text" },
  { fg: "text-muted", bg: "surface-raised", kind: "text" },
  { fg: "text-accent", bg: "surface-page", kind: "text" },
  { fg: "text-accent", bg: "surface-raised", kind: "text" },
  { fg: "action-primary-text", bg: "action-primary-bg", kind: "text" },
  { fg: "action-primary-text", bg: "action-primary-bg-hover", kind: "text" },
  { fg: "action-primary-text", bg: "action-primary-bg-pressed", kind: "text" },
  { fg: "action-danger-text", bg: "action-danger-bg", kind: "text" },
  { fg: "action-danger-text", bg: "action-danger-bg-pressed", kind: "text" },
  { fg: "action-danger-text", bg: "action-danger-bg-hover", kind: "text" },
  { fg: "status-success", bg: "surface-page", kind: "text" },
  { fg: "status-success", bg: "surface-raised", kind: "text" },
  { fg: "status-warning", bg: "surface-page", kind: "text" },
  { fg: "status-warning", bg: "surface-raised", kind: "text" },
  { fg: "status-danger", bg: "surface-page", kind: "text" },
  { fg: "status-danger", bg: "surface-raised", kind: "text" },
  { fg: "status-info", bg: "surface-page", kind: "text" },
  { fg: "status-info", bg: "surface-raised", kind: "text" },
  { fg: "action-primary-bg", bg: "surface-page", kind: "ui" },
  { fg: "action-primary-bg", bg: "surface-raised", kind: "ui" },
  { fg: "action-primary-bg-hover", bg: "surface-page", kind: "ui" },
  { fg: "action-primary-bg-hover", bg: "surface-raised", kind: "ui", note: "Przycisk jest rozpoznawalny po napisie, więc wypełnienie nie jest wymagane do jego identyfikacji (WCAG 1.4.11). Do decyzji." },
  { fg: "action-primary-bg-pressed", bg: "surface-page", kind: "ui" },
  { fg: "action-primary-bg-pressed", bg: "surface-raised", kind: "decor", note: "Stan chwilowy: napis identyfikuje przycisk, więc kontrast wypełnienia z panelem nie jest wymagany (WCAG 1.4.11)." },
  { fg: "action-danger-bg-pressed", bg: "surface-page", kind: "ui" },
  { fg: "action-danger-bg-pressed", bg: "surface-raised", kind: "decor", note: "Stan chwilowy: jak wyżej." },
  { fg: "action-danger-bg", bg: "surface-page", kind: "ui" },
  { fg: "action-danger-bg", bg: "surface-raised", kind: "ui" },
  { fg: "action-danger-bg-hover", bg: "surface-page", kind: "ui" },
  { fg: "action-danger-bg-hover", bg: "surface-raised", kind: "ui" },
  { fg: "focus-ring", bg: "surface-page", kind: "ui" },
  { fg: "focus-ring", bg: "surface-raised", kind: "ui" },
  { fg: "border-control", bg: "surface-page", kind: "ui" },
  { fg: "border-control", bg: "surface-raised", kind: "ui" },
  { fg: "status-success", bg: "surface-raised", kind: "ui" },
  { fg: "status-warning", bg: "surface-raised", kind: "ui" },
  { fg: "status-danger", bg: "surface-raised", kind: "ui" },
  { fg: "status-info", bg: "surface-raised", kind: "ui" },
  { fg: "border-default", bg: "surface-page", kind: "decor" },
  { fg: "surface-raised", bg: "surface-page", kind: "decor" },
  { fg: "board-line", bg: "board-surface", kind: "ui" },
  { fg: "board-line", bg: "board-grain", kind: "ui" },
  { fg: "piece-black", bg: "board-surface", kind: "ui" },
  { fg: "piece-black", bg: "board-grain", kind: "ui" },
  { fg: "piece-white", bg: "board-surface", kind: "ui", note: "Biały kamień sam nie odcina się od planszy; rozwiązuje to obrys piece-outline (R01.8)." },
  { fg: "piece-white", bg: "board-grain", kind: "ui", note: "Jak wyżej: obrys piece-outline." },
  { fg: "board-marker", bg: "board-surface", kind: "ui" },
  { fg: "piece-outline", bg: "board-surface", kind: "ui" },
  { fg: "piece-white", bg: "piece-outline", kind: "ui" },
];

export type ValueToken = { token: string; role: string; source: string; use: string; avoid: string };

export const SPACE_TOKENS: readonly ValueToken[] = [
  { token: "space-group", role: "W grupie", source: "tokeny.md (propozycja przyjęta)", use: "etykieta–pole, ikona–tekst", avoid: "między sekcjami" },
  { token: "space-stack", role: "Między grupami", source: "tokeny.md (propozycja przyjęta)", use: "odstęp między grupami w panelu lub formularzu", avoid: "wewnątrz panelu" },
  { token: "space-panel", role: "Wewnątrz panelu i marginesy strony", source: "tokeny.md (propozycja przyjęta)", use: "wypełnienie panelu, margines strony", avoid: "między sekcjami" },
  { token: "space-section", role: "Między sekcjami", source: "tokeny.md (propozycja przyjęta)", use: "odstęp między sekcjami strony", avoid: "wewnątrz grupy" },
];

export const SPACE_SCALE = ["space-1", "space-2", "space-3", "space-4", "space-6", "space-8", "space-12"] as const;
