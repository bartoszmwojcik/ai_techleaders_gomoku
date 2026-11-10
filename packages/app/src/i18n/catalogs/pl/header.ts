import type { Dict } from "@gomoku/core/i18n/translator";

/** The top bar of every player page: theme, language, the account menu and logging out. Source of the types. */
const header = {
  theme: {
    light: "Jasny motyw",
    dark: "Ciemny motyw",
  },
  language: {
    menuLabel: "Język: {language}, zmień język",
  },
  session: {
    menuLabel: "Zalogowano jako {name}, menu konta",
    account: "Konto",
    history: "Historia",
    logout: "Wyloguj",
  },
  logout: {
    title: "Wylogować?",
    gameRunning: "Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?",
    gameUnknown: "Nie udało się sprawdzić, czy trwa partia. Jeśli trwa, po wylogowaniu zegar biegnie dalej. Wylogować?",
    confirm: "Wyloguj",
    cancel: "Zostań zalogowany",
    failed: "Nie udało się wylogować. Spróbuj ponownie.",
    failedTitle: "Nie udało się wylogować",
    failedRetry: "Spróbuj ponownie.",
  },
} satisfies Dict;

export default header;
