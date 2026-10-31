# Test, który importuje cały kontener, potrzebuje własnego limitu czasu

- **Problem:** pierwszy test `container.test.ts` ładuje wszystkie serwisy i liczy bcrypt (koszt 12); samotnie trwa ok. 4 s, a przy 200 równoległych plikach testowych przekraczał domyślne 5 s i czerwienił `npm test`.
- **Reguła:** test z ciężkim importem lub kosztownym hashowaniem dostaje jawny limit (`it(…, fn, 30_000)`), a nie powtórki; czerwony test przechodzący samotnie jest sygnałem obciążenia, nie błędu logiki.
- **Powiązane:** E06-S02 (#128).
