import type { Dict } from "@gomoku/core/i18n/translator";

/** The history of an account's games (E15-S05, package C3). Source of the types. */
const history = {
  meta: { title: "Historia partii — Gomoku" },
  heading: "Historia partii",
  listTitle: "Zakończone partie",
  loading: "Ładowanie historii partii",
  emptyTitle: "Nie rozegrałeś jeszcze żadnej partii",
  emptyBody: "Zagraj ze znajomym albo wybierz przeciwnika w lobby, a zakończone partie pojawią się tutaj.",
  review: "Przejrzyj partię",
  /** Polish kept as it was shown before E15 (one wording for every count). */
  added: {
    one: "Dodano {count} starszych partii.",
    few: "Dodano {count} starszych partii.",
    many: "Dodano {count} starszych partii.",
    other: "Dodano {count} starszych partii.",
  },
  sessionExpired: "Sesja wygasła",
  loginAgain: "Zaloguj się ponownie",
  signedOut: "{link}, żeby zobaczyć starsze partie.",
  more: "Pokaż starsze",
  retry: "Spróbuj ponownie",
  moreFailedTitle: "Nie udało się wczytać starszych partii",
  moreFailedBody: "Sprawdź połączenie z internetem i spróbuj ponownie.",
  backHome: "Wróć na stronę główną",
  result: { win: "Wygrana", loss: "Porażka", draw: "Remis" },
  reason: { five_in_row: "5 w linii", timeout: "Koniec czasu", resignation: "Poddanie", draw: "Plansza pełna", points: "Punkty" },
  /** The paper game next to its date: "Papier i ołówek · 7 : 5". */
  paperDetail: "{variant} · {score}",
  paperDetailWithReason: "{variant} · {score} · {reason}",
} satisfies Dict;

export default history;
