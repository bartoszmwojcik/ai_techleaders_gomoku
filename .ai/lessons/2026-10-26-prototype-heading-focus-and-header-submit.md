# Prototyp: fokus nagłówka i przycisk w nagłówku logowania

- **Problem:** w prototypie `konta-i-role` recenzent zgłosił (komentarze z eksportu `prototype-feedback.md`), że po wejściu na s01 i s02 nagłówek `h1` dostaje widoczny obrys fokusu, oraz że przycisk „Zaloguj się” w nagłówku ekranu logowania nie robił tego, co przycisk pod formularzem.
- **Kontekst:** silnik przeglądu (`lekcja-07/silnik-przegladu/prototype.js`) po każdym przejściu ustawia `tabindex="-1"` i `focus()` na pierwszym `h1`/`h2` ekranu; przycisk w `SiteHeader` był zwykłym linkiem do `#s02`.
- **Reguła:** w prototypach z tym silnikiem wyłączaj obrys na elementach `[tabindex="-1"]` (fokus programowy dla czytników zostaje, pierścień nie); przycisk w nagłówku, który powtarza akcję formularza na tej samej stronie, ma być `type="submit"` z atrybutem `form`, a nie linkiem.
- **Powiązane:** `prototypes/konta-i-role/src/review/host.css`, `src/chrome.tsx` (`SiteHeader`), mapa ekranów s01, s02.
