# Gałąź po obu stronach miejsca (seat) i martwe `??`

- **Problem:** PR deklarował 100% pokrycia, a `npm test` zgłaszał gałęzie poniżej progu: `other(seat)` było testowane tylko dla agenta na miejscu 2, a `field ?? "wejście"` w `invalidInput` było martwą gałęzią (argument zawsze tekstem).
- **Reguła:** czyste funkcje zależne od miejsca (`seat`) testuj dla obu miejsc; nie dodawaj domyślnych wartości (`??`) dla argumentów, które typ i wywołujący zawsze podają — zawęź typ zamiast. Deklarację „100%” opieraj na pełnym `npm test` z progiem, nie na wyliczeniu z pamięci.
- **Powiązane:** E06-S02 (#128), przegląd PR #163.
