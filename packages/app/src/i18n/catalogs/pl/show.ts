import type { Dict } from "@gomoku/core/i18n/translator";

/**
 * The administrator's show (spec 2026-11-09-show-mode, E14): the console `/show` and the read-only view
 * `/show/[gameId]`. Source of the types; English and French in the same PR (E15 note on #280).
 */
const show = {
  layout: {
    "bot-bot": "Bot vs bot",
    "bot-agent": "Bot vs agent",
  },
  bot: {
    name: "Bot · poziom {level}",
    nameWithTable: "Bot · poziom {level} · {table}",
  },
  agent: {
    name: "Agent",
    declared: "Agent · {name} (deklarowane)",
  },
  console: {
    title: "Pokaz",
    lead: "Partia botów na dużym ekranie. Ogląda ją tylko administrator, nie trafia do historii ani liczników.",
    disabledTitle: "Pokaz jest wyłączony",
    disabledBody: "Włącz go zmienną SHOW_ENABLED=true w konfiguracji serwera i uruchom aplikację ponownie.",
    runningTitle: "Trwa pokaz",
    runningLayout: "Układ: {layout}",
    runningStatus: {
      active: "Stan: w toku",
      waiting: "Stan: czeka na agenta",
    },
    back: "Wróć do pokazu",
    formBlocked: "Nowy pokaz rozpoczniesz, gdy ten się zakończy.",
    formTitle: "Nowy pokaz",
    botVsBotDisabled: "Układ bot vs bot jest wyłączony: ustaw SHOW_BOT_VS_BOT_ENABLED=true.",
    levelLabel: "Bot na miejscu {seat}",
    level: "Poziom {level}",
    level2Blocked: "Poziom 2 w bot vs bot czeka na strojenie tempa i pomiar na serwerze.",
    check: "Sprawdź, czy pokaz wystartuje",
    start: "Rozpocznij pokaz",
  },
  checks: {
    title: "Wynik sprawdzenia",
    ready: "Pokaz wystartuje.",
    notReady: "Pokaz nie wystartuje: popraw pozycje oznaczone jako niespełnione.",
    failed: "Nie udało się sprawdzić. Spróbuj ponownie.",
    pass: "spełnione",
    fail: "niespełnione",
    unknown: "niesprawdzone",
    item: {
      show_enabled: "Pokaz włączony (SHOW_ENABLED)",
      bot_vs_bot_enabled: "Układ bot vs bot włączony (SHOW_BOT_VS_BOT_ENABLED)",
      level2_enabled: "Poziom 2 w bot vs bot włączony (SHOW_BOT_LEVEL2_ENABLED)",
      bot_enabled: "Bot włączony (BOT_ENABLED)",
      memory: "Pamięć: dostępne {available}, potrzeba co najmniej {min}",
      slot: "Partie z botem w toku: {active} z {max}",
      no_show_running: "Brak trwającego pokazu",
      engine: "Silnik bota (próbny ruch sprawdzi kolejna wersja)",
    },
  },
  errors: {
    createTitle: "Nie udało się rozpocząć pokazu",
    code: "Kod błędu: {code}",
    SHOW_RUNNING: "Trwa już pokaz. Wróć do niego albo go zakończ.",
    SHOW_UNAVAILABLE: {
      disabled: "Pokaz jest wyłączony (SHOW_ENABLED).",
      bot_vs_bot_disabled: "Układ bot vs bot jest wyłączony (SHOW_BOT_VS_BOT_ENABLED).",
    },
    BOT_UNAVAILABLE: {
      disabled: "Bot jest wyłączony (BOT_ENABLED).",
      memory: "Serwer ma za mało wolnej pamięci dla bota (BOT_MIN_AVAILABLE_MB).",
      busy: "Wszystkie miejsca na partie z botem są zajęte (BOT_MAX_ACTIVE_GAMES).",
      level2_not_allowed: "Poziom 2 w bot vs bot jest wyłączony (SHOW_BOT_LEVEL2_ENABLED).",
      other: "Bot jest teraz niedostępny.",
    },
    RATE_LIMITED: "Za dużo pokazów w ciągu godziny. Spróbuj później.",
    other: "Coś poszło nie tak. Spróbuj ponownie.",
  },
  end: {
    action: "Zakończ pokaz",
    title: "Zakończyć pokaz?",
    body: "Partia zostanie przerwana bez wyniku. Tego nie można cofnąć.",
    confirm: "Zakończ pokaz",
    cancel: "Wróć",
    failed: "Nie udało się zakończyć pokazu. Spróbuj ponownie.",
  },
  room: {
    title: "Pokaz: {layout}",
    finishedTitle: "Koniec pokazu",
    drive: {
      running: "Napęd działa",
      slowed: "Napęd zwalnia: ponawiamy odczyt stanu",
      stalledBecause: "Napęd zatrzymany: {reason}",
      reason: {
        hidden: "Karta w tle",
        bot: "Bot nie odpowiada",
        silent: {
          one: "Brak odpowiedzi serwera od {seconds} sekundy",
          few: "Brak odpowiedzi serwera od {seconds} sekund",
          many: "Brak odpowiedzi serwera od {seconds} sekund",
          other: "Brak odpowiedzi serwera od {seconds} sekundy",
        },
      },
      hint: {
        hidden: "Przeglądarka spowalnia odczyty w karcie w tle. Zostaw pokaz na wierzchu.",
        bot: "Serwer czeka na ruch bota dłużej niż jego pauza i limit ruchu razem.",
        silent: "Sprawdź połączenie z serwerem.",
      },
      clock: "Zegar biegnie dalej, partia skończy się czasem (jeszcze {time}).",
      check: "Sprawdź teraz",
    },
    projector: "Widok pod projektor",
    projectorOn: "Włączono widok pod projektor",
    projectorOff: "Wyłączono widok pod projektor",
    ended: "Pokaz zakończony przez administratora",
    expired: "Pokaz wygasł (agent nie dołączył)",
    goneTitle: "Pokazu już nie ma",
    goneBody: "Pokaz zniknął po zakończeniu albo sesja administratora wygasła.",
    goneAction: "Wróć do konsoli pokazu",
    newShow: "Nowy pokaz",
    logout: "Wyloguj",
    logoutFailed: "Nie udało się wylogować. Spróbuj ponownie.",
    clockActive: "Ruch",
    side: {
      black: "Czarne: {name}",
      white: "Białe: {name}",
    },
    turn: {
      black: "Ruch czarnych: {name}",
      white: "Ruch białych: {name}",
    },
    wins: {
      black: "Wygrały czarne: {name}",
      white: "Wygrały białe: {name}",
    },
    draw: "Remis",
    reason: {
      five_in_row: "Pięć kamieni w jednej linii.",
      timeout: "Drugiej stronie skończył się czas.",
      resignation: "Druga strona poddała partię.",
      draw: "Plansza jest pełna, nikt nie ułożył pięciu kamieni.",
      points: "Wygrał wyższy wynik punktowy.",
    },
  },
  board: {
    label: "Plansza 15 na 15",
    cell: "Kolumna {column}, rząd {row}, {state}",
    empty: "puste",
    black: "czarny kamień",
    white: "biały kamień",
  },
} satisfies Dict;

export default show;
