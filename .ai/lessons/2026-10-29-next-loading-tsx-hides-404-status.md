# `loading.tsx` zamienia status 404 strony na 200

- **Problem:** `notFound()` na stronie `/games/[gameId]` dawał `200` zamiast `404` (treść „nie istnieje albo nie masz dostępu” była dobra, status nie), bo obok strony leżał `loading.tsx`: Next zaczyna strumieniować powłokę ze szkieletem przed rozstrzygnięciem strony, a po rozpoczęciu strumienia status zostaje `200`.
- **Kontekst:** Epik 02, zadanie 2.4; wykryte `curl -w '%{http_code}'` na działającym `next dev` i potwierdzone w teście integracyjnym na buildzie.
- **Reguła:** strona, której `404` ma być prawdziwym statusem HTTP (obca lub nieistniejąca partia), nie ma `loading.tsx` w swoim segmencie; stan ładowania (p07.1) robimy inaczej (np. `Suspense` w środku strony), jeśli to konieczne. Status sprawdzaj `curl`-em i w teście integracyjnym (`fetch`), nie tylko tekst w przeglądarce.
- **Powiązane:** `.ai/specs/implemented/2026-10-24-game-invitations.md` (N-05), `lekcja-07/mapa-ekranow-partia.md` (p07.1, p07.2).
