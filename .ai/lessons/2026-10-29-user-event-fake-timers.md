# `userEvent` z `vi.useFakeTimers` zawiesza test

- **Problem:** testy klienckiego komponentu z odpytywaniem (`setInterval`) używały `vi.useFakeTimers()` i `userEvent`; każdy `await user.click()` wisiał do limitu 5 s, bo `userEvent` czeka na własne `setTimeout`.
- **Kontekst:** Epik 02, zadanie 2.4 (`game-room.test.tsx`).
- **Reguła:** w testach z `userEvent` użyj `vi.useFakeTimers({ shouldAdvanceTime: true })` i `userEvent.setup({ delay: null })`, a czas odpytywania przesuwaj `await act(async () => vi.advanceTimersByTimeAsync(ms))`. `userEvent.setup()` podmienia też `navigator.clipboard`: atrapę schowka ustawiaj po wywołaniu `setup()`.
- **Powiązane:** `packages/app/src/app/(frontend)/games/[gameId]/game-room.test.tsx`.
