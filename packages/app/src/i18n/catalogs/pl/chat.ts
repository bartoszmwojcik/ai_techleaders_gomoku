import type { Dict } from "@gomoku/core/i18n/translator";

/** The chat of a game, for the players and the spectators (E15-S04, package C2). Source of the types. */
const chat = {
  title: "Czat",
  with: "z",
  waiting: "Czat będzie dostępny, gdy przeciwnik dołączy do partii.",
  closed: "Czat jest już zamknięty.",
  disabledByYou:
    "Wyłączyłeś czat. Nie widzisz wiadomości rozmówcy i nie możesz pisać. Rozmówca zobaczy, że czat jest wyłączony.",
  turnOff: "Wyłącz czat",
  turnOn: "Włącz czat",
  turnOffFailed: "Nie udało się wyłączyć czatu. Spróbuj ponownie.",
  turnOnFailed: "Nie udało się włączyć czatu. Spróbuj ponownie.",
  disabledByOpponent: "Rozmówca wyłączył czat. Nie możesz teraz pisać.",
  disabledByOpponentReason: "Pisanie jest zablokowane: rozmówca wyłączył czat.",
  opponentDisabledPublic: "Rozmówca wyłączył czat i nie zobaczy Twoich wiadomości. Możesz pisać do widzów.",
  loading: "Wczytujemy czat…",
  infoLabel: "Informacja o wiadomościach czatu",
  info: "Wiadomości nie są trwale zapisywane: usuwamy je około godziny po zakończeniu partii, a przy usunięciu konta od razu. Widzą je tylko uczestnicy partii. Każdy z nich może wyłączyć czat w tej partii. Czat nie ma moderacji ani zgłaszania nadużyć.",
  spectatorInfo:
    "Wiadomości nie są trwale zapisywane: usuwamy je około godziny po zakończeniu partii, a przy usunięciu konta od razu. Widzą je gracze i widzowie. Gracz może wyłączyć czat dla siebie — wtedy nie zobaczy Twoich wiadomości, ale pozostali nadal rozmawiają. Czat nie ma moderacji ani zgłaszania nadużyć.",
  readOnly: "Aby pisać na czacie, wejdź z nickiem lub zalogowany jako konto. Bez tego możesz tylko czytać.",
  collapse: "Zwiń czat",
  expand: "Rozwiń czat",
  unread: {
    one: "Czat ({count} nowa)",
    few: "Czat ({count} nowe)",
    many: "Czat ({count} nowych)",
    other: "Czat ({count} nowej)",
  },
  unreadStatus: {
    one: "Czat: {count} nowa",
    few: "Czat: {count} nowe",
    many: "Czat: {count} nowych",
    other: "Czat: {count} nowej",
  },
  refreshFailed: "Nie udało się odświeżyć czatu. Ponawiamy próby.",
  retry: "Spróbuj ponownie",
  empty: "Nikt jeszcze nic nie napisał. Napisz pierwszy.",
  log: "Wiadomości czatu",
  sending: "Wysyłanie…",
  newMessages: "Nowe wiadomości",
  you: "Ty",
  message: "Wiadomość",
  send: "Wyślij",
  resend: "Ponów wysyłanie",
  wait: "Poczekaj chwilę przed następną wiadomością.",
  offline: "Nie wysłano: brak połączenia.",
  left: {
    one: "Pozostało {count} znak",
    few: "Pozostało {count} znaki",
    many: "Pozostało {count} znaków",
    other: "Pozostało {count} znaku",
  },
  over: {
    one: "Za dużo o {count} znak",
    few: "Za dużo o {count} znaki",
    many: "Za dużo o {count} znaków",
    other: "Za dużo o {count} znaku",
  },
  /** One text per `ChatRejection` of `core` (a missing one breaks the typecheck of the composer). */
  rejection: {
    not_text: "Wiadomość musi być tekstem.",
    empty: "Wpisz wiadomość.",
    too_long: "Wiadomość jest za długa.",
    control_char: "Wiadomość nie może zawierać znaków sterujących ani nowych linii.",
    invisible_char: "Wiadomość nie może zawierać niewidocznych znaków.",
    combining_run: "Wiadomość zawiera zbyt wiele znaków łączących.",
    url: "Wiadomość nie może zawierać adresów internetowych.",
  },
  refused: {
    CHAT_UNAVAILABLE: "Czat jest teraz niedostępny w tej partii.",
    CHAT_DISABLED: "Czat jest wyłączony.",
    CHAT_FULL: "W tej partii jest już maksymalna liczba wiadomości.",
  },
} satisfies Dict;

export default chat;
