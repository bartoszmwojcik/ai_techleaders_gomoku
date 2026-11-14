/**
 * Texts of API errors and field errors (E15-S07, C5), looked up by `lib/api-error-text.ts`: a field issue by
 * `field.{field}.{code}` (shared by every form with that field), then the generic `zod.{code}.{origin}.{variant}`;
 * an API error by `api.{code}.{reason}`, then `api.{code}`. In a group, `_` is the text of the group itself.
 * Numbers come in `{count}` (the limit of the rule), so plural forms follow the number.
 */
const errors = {
  zod: {
    invalid_type: "Nieprawidłowa wartość.",
    too_small: {
      _: "Wartość jest za mała.",
      string: {
        inclusive: {
          one: "Wpisz co najmniej {count} znak.",
          few: "Wpisz co najmniej {count} znaki.",
          many: "Wpisz co najmniej {count} znaków.",
          other: "Wpisz co najmniej {count} znaku.",
        },
        exclusive: {
          one: "Wpisz więcej niż {count} znak.",
          few: "Wpisz więcej niż {count} znaki.",
          many: "Wpisz więcej niż {count} znaków.",
          other: "Wpisz więcej niż {count} znaku.",
        },
        exact: {
          one: "Wpisz dokładnie {count} znak.",
          few: "Wpisz dokładnie {count} znaki.",
          many: "Wpisz dokładnie {count} znaków.",
          other: "Wpisz dokładnie {count} znaku.",
        },
      },
      number: {
        inclusive: "Podaj liczbę nie mniejszą niż {count}.",
        exclusive: "Podaj liczbę większą niż {count}.",
        exact: "Podaj liczbę {count}.",
      },
    },
    too_big: {
      _: "Wartość jest za duża.",
      string: {
        inclusive: {
          one: "Wpisz najwyżej {count} znak.",
          few: "Wpisz najwyżej {count} znaki.",
          many: "Wpisz najwyżej {count} znaków.",
          other: "Wpisz najwyżej {count} znaku.",
        },
        exclusive: {
          one: "Wpisz mniej niż {count} znak.",
          few: "Wpisz mniej niż {count} znaki.",
          many: "Wpisz mniej niż {count} znaków.",
          other: "Wpisz mniej niż {count} znaku.",
        },
        exact: {
          one: "Wpisz dokładnie {count} znak.",
          few: "Wpisz dokładnie {count} znaki.",
          many: "Wpisz dokładnie {count} znaków.",
          other: "Wpisz dokładnie {count} znaku.",
        },
      },
      number: {
        inclusive: "Podaj liczbę nie większą niż {count}.",
        exclusive: "Podaj liczbę mniejszą niż {count}.",
        exact: "Podaj liczbę {count}.",
      },
    },
    invalid_format: {
      _: "Nieprawidłowy format.",
      email: "Podaj poprawny adres e-mail.",
      regex: "Wpisany tekst zawiera niedozwolone znaki.",
    },
    invalid_value: "Wybierz jedną z dostępnych wartości.",
    invalid_union: "Nieprawidłowa wartość.",
    unrecognized_keys: "Formularz zawiera nieznane pola.",
    invalid_key: "Nieprawidłowy klucz.",
    invalid_element: "Nieprawidłowy element.",
    not_multiple_of: "Nieprawidłowa wartość.",
    custom: "Nieprawidłowa wartość.",
    unknown: "Nieprawidłowa wartość.",
  },
  field: {
    email: {
      invalid_type: "Podaj adres e-mail.",
      too_big: "Adres e-mail może mieć najwyżej {count} znaków.",
      invalid_format: "Podaj poprawny adres e-mail.",
    },
    newEmail: {
      invalid_type: "Podaj adres e-mail.",
      too_big: "Adres e-mail może mieć najwyżej {count} znaków.",
      invalid_format: "Podaj poprawny adres e-mail.",
      EMAIL_UNCHANGED: "To już jest adres Twojego konta.",
    },
    password: {
      invalid_type: "Podaj hasło.",
      too_small: "Podaj hasło.",
      too_big: "Hasło może mieć najwyżej {count} znaków.",
      PASSWORD_TOO_SHORT: "Hasło musi mieć co najmniej {count} znaków.",
      PASSWORD_TOO_LONG: "Hasło może mieć najwyżej {count} bajtów.",
      INVALID_PASSWORD: "Nieprawidłowe hasło.",
    },
    currentPassword: {
      invalid_type: "Podaj obecne hasło.",
      too_small: "Podaj obecne hasło.",
      too_big: "Hasło może mieć najwyżej {count} znaków.",
      INVALID_CURRENT_PASSWORD: "Obecne hasło jest nieprawidłowe.",
    },
    newPassword: {
      invalid_type: "Podaj hasło.",
      PASSWORD_TOO_SHORT: "Hasło musi mieć co najmniej {count} znaków.",
      PASSWORD_TOO_LONG: "Hasło może mieć najwyżej {count} bajtów.",
      PASSWORD_UNCHANGED: "Nowe hasło musi się różnić od obecnego.",
    },
    displayName: {
      invalid_type: "Podaj nazwę gracza.",
      too_small: "Nazwa gracza musi mieć co najmniej {count} znaki.",
      too_big: "Nazwa gracza może mieć najwyżej {count} znaków.",
      invalid_format: "Nazwa gracza może zawierać tylko litery, cyfry oraz znaki _ i - (bez spacji).",
      DISPLAY_NAME_RESERVED: "Ta nazwa jest zastrzeżona.",
      DISPLAY_NAME_TAKEN: "Ta nazwa gracza jest już zajęta.",
      DISPLAY_NAME_UNCHANGED: "To już jest Twoja nazwa gracza.",
    },
    nickname: {
      invalid_type: "Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.",
      NICKNAME_TOO_LONG: "Nick może mieć najwyżej {count} znaków.",
      NICKNAME_INVALID: "Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.",
      NICKNAME_RESERVED: "Ta nazwa jest zastrzeżona.",
      NICKNAME_GUEST_ONLY: "Nick podaje tylko gość.",
    },
    acknowledgedGuestWarning: {
      invalid_type: "Potwierdź, że rozumiesz ograniczenia gry bez konta.",
      GUEST_WARNING_REQUIRED: "Potwierdź, że rozumiesz ograniczenia gry bez konta.",
    },
    cancelOwnWaitingGame: {
      invalid_type: "Nieprawidłowa wartość.",
    },
    isPublic: {
      invalid_type: "Nieprawidłowa wartość.",
      BOT_PUBLIC: "Partia z botem nie może być publiczna.",
    },
    confirm: {
      invalid_value: "Zaznacz potwierdzenie, aby usunąć konto.",
    },
    as: {
      invalid_value: "Wybierz, jak dołączasz do partii.",
    },
    variant: {
      invalid_value: "Nieprawidłowy wariant partii.",
    },
    timeControlMs: {
      invalid_union: "Nieprawidłowy czas partii.",
      TIME_CONTROL_CLASSIC: "Czas partii można wybrać tylko w wariancie „papier i ołówek”.",
    },
    opponent: {
      invalid_value: "Nieprawidłowy przeciwnik.",
      BOT_VARIANT_UNSUPPORTED: "Bot gra tylko w wariancie klasycznym.",
    },
    botLevel: {
      invalid_union: "Nieprawidłowy poziom bota.",
      BOT_LEVEL_REQUIRED: "Wybierz poziom bota.",
      BOT_LEVEL_WITHOUT_BOT: "Poziom bota wybiera się tylko w partii z botem.",
    },
    text: {
      invalid_type: "Wiadomość musi być tekstem.",
      too_big: "Wiadomość jest za długa.",
    },
  },
  api: {
    network: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
    VALIDATION: "Popraw zaznaczone pola.",
    UNAUTHORIZED: {
      _: "Zaloguj się, aby kontynuować.",
      session_required: "Zaloguj się, aby kontynuować.",
      join_sign_in: "Zaloguj się, aby dołączyć do partii.",
    },
    FORBIDDEN: {
      _: "Nie masz dostępu do tej operacji.",
      request_rejected: "Żądanie odrzucone.",
      spectator_name_required: "Aby pisać na czacie, wejdź z nickiem lub zalogowany jako konto.",
      agent_settings: "Agent nie zmienia ustawień czatu.",
    },
    NOT_FOUND: "Nie znaleziono partii.",
    CONFLICT: {
      _: "Nie udało się wykonać tej operacji.",
      email_taken: "Nie udało się założyć konta. Jeśli masz już konto, zaloguj się.",
      display_name_taken: "Ta nazwa gracza jest już zajęta.",
    },
    RATE_LIMITED: {
      _: "Zbyt wiele prób. Spróbuj ponownie później.",
      attempts: "Zbyt wiele prób. Spróbuj ponownie później.",
      chat_interval: "Poczekaj chwilę przed następną wiadomością.",
    },
    PAYLOAD_TOO_LARGE: "Żądanie jest zbyt duże.",
    INTERNAL: "Wystąpił nieoczekiwany błąd.",
    ACTIVE_GAME: "Najpierw dokończ albo poddaj partię.",
    ACTIVE_GAME_EXISTS: "Masz już partię. Dokończ ją albo anuluj oczekującą.",
    ADMIN_ACCOUNT_PROTECTED: "Tego konta nie można usunąć.",
    ADMIN_EMAIL_LOCKED: "Adresu e-mail tego konta nie można zmienić.",
    ALREADY_VERIFIED: "Adres e-mail jest już potwierdzony.",
    AUDIENCE_CLOSED: "Twórca zamknął publiczność tej partii.",
    BOT_UNAVAILABLE: "Bot jest teraz niedostępny. Spróbuj za chwilę albo zaproś osobę.",
    CANNOT_PICK_SELF: "Nie możesz zagrać sam ze sobą.",
    CELL_OCCUPIED: "To pole jest już zajęte.",
    CHAT_DISABLED: "Czat jest wyłączony.",
    CHAT_FULL: "W tej partii jest już maksymalna liczba wiadomości.",
    CHAT_UNAVAILABLE: "Czat jest teraz niedostępny w tej partii.",
    DISPLAY_NAME_COOLDOWN: "Nazwę gracza można zmienić raz na dobę. Spróbuj później.",
    DISPLAY_NAME_TAKEN: "Nazwa gracza jest już zajęta.",
    EMAIL_QUOTA_EXCEEDED:
      "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro albo zagraj jako gość z zaproszenia.",
    EMAIL_SEND_FAILED: "Nie udało się wysłać wiadomości. Spróbuj później.",
    FIRST_MOVE_CENTER: "Pierwszy kamień trafia na środek planszy.",
    GAME_FINISHED: "Ta partia jest już zakończona.",
    GAME_NOT_ACTIVE: {
      _: "Ta partia nie jest w toku.",
      game_not_active: "Ta partia nie jest w toku.",
      audience_not_closable: "Publiczność można zamknąć tylko w trwającej albo zakończonej partii.",
      show_ended: "Ten pokaz już się zakończył.",
    },
    GAME_NOT_CANCELLABLE: "Tej partii nie można już anulować.",
    GAME_NOT_FINISHED: "Rewanż jest możliwy dopiero po zakończeniu partii.",
    GAME_NOT_PUBLIC: "Ta partia nie jest publiczna.",
    GAME_NOT_STARTED: "Czekamy, aż przeciwnik otworzy partię.",
    GUEST_NOT_ALLOWED: "Jesteś zalogowany — dołącz jako on sam. Gra bez konta jest dla niezalogowanych.",
    INVALID_CREDENTIALS: "Nieprawidłowy e-mail lub hasło.",
    INVALID_CURRENT_PASSWORD: "Obecne hasło jest nieprawidłowe.",
    INVALID_INVITATION: "To zaproszenie jest już nieważne.",
    INVALID_PASSWORD: "Nieprawidłowe hasło.",
    INVALID_TOKEN: "Link wygasł lub został już użyty.",
    LOBBY_SEEKER_EXPIRED: "Status tego gracza wygasł.",
    LOBBY_SEEKER_TAKEN: "Ten gracz zagrał już z kimś innym. Wybierz kogoś innego z listy.",
    MOVE_TOO_FAR: "Kamień może stać najwyżej 3 pola od innego.",
    NOT_YOUR_TURN: {
      _: "Teraz ruch przeciwnika.",
      opponent_turn: "Teraz ruch przeciwnika.",
      auto_turn: "Automat stawia kamień.",
    },
    OWN_INVITATION: "To Twoje własne zaproszenie — przeciwnik musi być kimś innym.",
    OWN_WAITING_GAME: {
      _: "Masz oczekującą partię. Anuluj ją, aby kontynuować.",
      create: "Masz oczekującą partię. Anuluj ją, aby utworzyć nową.",
      join: "Masz oczekującą partię. Anuluj ją, aby dołączyć do tej.",
    },
    REMATCH_ALREADY_OFFERED: "Rewanż został już zaproponowany.",
    REMATCH_EXPIRED: "Propozycja rewanżu wygasła.",
    REMATCH_NOT_OFFERED: "Nie ma propozycji rewanżu do rozstrzygnięcia.",
    REMATCH_UNAVAILABLE: {
      _: "Rewanż jest niemożliwy.",
      opponent_gone: "Przeciwnik nie jest już dostępny, rewanż jest niemożliwy.",
      bot: "Z botem nie ma rewanżu. Zagraj ponownie z botem w nowej partii.",
    },
    SHOW_RUNNING: "Trwa już pokaz. Zakończ go albo wróć do niego.",
    SHOW_UNAVAILABLE: "Pokaz jest teraz wyłączony.",
    SPECTATORS_FULL: "Partia ma komplet widzów.",
    STALE_MOVE: "Plansza zmieniła się — odśwież widok.",
  },
};

export default errors;
