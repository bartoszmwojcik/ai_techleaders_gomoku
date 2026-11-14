import type { Dict } from "@gomoku/core/i18n/translator";

/** The review of a finished game (E15-S05, package C3). Source of the types. */
const review = {
  meta: { title: "Przegląd partii — Gomoku" },
  heading: "Przegląd partii",
  banner: "{reason}. {detail}",
  finishedAt: "Zakończona: {date}",
  players: "Gracze",
  playerLine: "{side}: ",
  paperTitle: "Podgląd ruch po ruchu jest niedostępny",
  paperBody: "Ta partia była rozegrana w wariancie „Papier i ołówek”. Wynik i gracze są powyżej.",
  steps: "Przechodzenie po ruchach",
  start: "Początek",
  previous: "Poprzedni",
  next: "Następny",
  end: "Koniec",
  emptyBoard: "Początek partii — plansza jest pusta",
  /** "Ruch 12 z 37: biały, kolumna F, rząd 8". */
  step: "Ruch {step} z {total}: {color}, kolumna {column}, rząd {row}",
  color: { black: "czarny", white: "biały" },
  backHome: "Wróć na stronę główną",
  backToHistory: "Wróć do historii",
  notFoundTitle: "Nie możemy otworzyć tej partii",
  notFoundBody: "Partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu.",
} satisfies Dict;

export default review;
