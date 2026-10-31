# Prawdziwy timer w kodzie to niedeterministyczne pokrycie

- **Problem:** job `unit` na `main` padał z `Coverage for functions (97.87%) ... statements (99.6%)` dla `game-room.tsx` przy zielonych testach, także na PR-ach zmieniających tylko `.md` (#120).
- **Przyczyna:** `AbortSignal.timeout(POLL_TIMEOUT_MS)` używa prawdziwego timera Node (nie jest objęty `vi.useFakeTimers`). Listener `() => controller.abort()` był pokryty tylko wtedy, gdy plik testowy trwał dłużej niż 8 s realnego czasu od pierwszego odczytu (lokalnie ~10 s, w CI ~8,5 s — na granicy). Nie chodziło o datę ani strefę czasową.
- **Reguła:** callback wywoływany przez prawdziwy timer, `AbortSignal.timeout`, `performance`/I/O nie może być pokryty „przy okazji” czasu trwania testu. Testuj go deterministycznie: `vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)` i `controller.abort()` w teście. Gdy pokrycie pliku skacze bez zmiany kodu, odtwórz problem, podmieniając podejrzane źródło czasu na nigdy niewyzwalające się i porównaj liczby z logiem CI.
- **Powiązane:** #120, #119.
