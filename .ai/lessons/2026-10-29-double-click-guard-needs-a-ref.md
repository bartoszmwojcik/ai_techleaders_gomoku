# Blokada podwójnego kliknięcia: `useRef`, nie sam stan

- **Problem:** po review fazy 2 „Graj jako gość” wysyłał drugie żądanie `accept` (drugie dostawało `410` i zużywało pulę prób, Q13). Strażnik `if (busy) return` oparty na stanie React nie zatrzymuje dwóch zdarzeń z jednej partii (dwa `click()` w jednym `act`), bo stan zmienia się dopiero po renderze.
- **Kontekst:** Epik 02, zadanie 2.4 (strony `/invite`, `/games`, przycisk „Utwórz zaproszenie”).
- **Reguła:** przycisk wysyłający żądanie zmieniające stan ma `useRef` „w locie” sprawdzany i ustawiany synchronicznie na początku handlera (zerowany przy błędzie), a stan `busy`/`loading` służy tylko do wyglądu (wyłączony przycisk, etykieta). Test: dwa natywne `element.click()` w jednym `act`, a nie `userEvent.dblClick` (ten czeka na render między kliknięciami). Dotyczy też `Enter` w polu formularza (`fireEvent.submit` dwa razy).
- **Powiązane:** `.ai/specs/implemented/2026-10-24-game-invitations.md` (Q13), `track-e02.md` 2.4.
