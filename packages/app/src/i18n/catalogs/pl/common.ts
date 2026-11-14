import type { Dict } from "@gomoku/core/i18n/translator";

/** Texts shared by every player page. Source of the types. */
const common = {
  meta: {
    description: "Gomoku 1:1 online — swobodne zasady, plansza 15×15, zegar 10 minut na gracza.",
  },
  player: {
    /** Default name of a guest without a nickname; `{seat}` is 1 or 2. */
    guestDefault: "Gracz {seat}",
    /** An account that was deleted (BR-17). */
    deleted: "Usunięty gracz",
    agent: "Agent",
    /** An agent that gave a model name about itself (BR-31): never shown as a fact. */
    agentDeclared: "Agent · {name} (deklarowane)",
    declaredSuffix: "(deklarowane)",
    guestSuffix: "(gość)",
    guestLabel: "{name} (gość)",
    you: "Ty",
    youAccount: "Ty ({name})",
    youGuestLead: "Ty: ",
  },
  bot: {
    /** The bot without a name from the server. */
    plain: "Bot",
    name: "Bot · poziom {level}",
    nameWithTable: "Bot · poziom {level} · {table}",
  },
  /** The error boundary of a game page (above the page, so it reads the segment layout's namespace). */
  rateLimited: {
    title: "Zbyt wiele prób",
    later: "Spróbuj ponownie za jakiś czas.",
    inMinutes: "Spróbuj ponownie za {minutes} min.",
  },
  connectionError: {
    title: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
    body: "Nie wiemy, czy ta partia istnieje: serwer nie odpowiada.",
    retry: "Spróbuj ponownie",
    backHome: "Wróć na stronę główną",
  },
} satisfies Dict;

export default common;
