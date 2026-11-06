# `worker_threads` pod Turbopackiem: literalne `new Worker(new URL(…))`

**Problem.** Specyfikacja bota (E13, R5) wymagała wątku roboczego, a nie było wiadomo, czy Turbopack (`next build`/`next start`, Next 16) spakuje plik wątku importujący źródła TS z `@gomoku/core` (spike E13-S04-T01, #263).

**Kontekst.** Spike: trasa API tworząca `new Worker(new URL("../../../server/spike-worker.ts", import.meta.url), { workerData, resourceLimits })`, wątek liczy `chooseMove`. Sprawdzone lokalnie i w obrazie produkcyjnym (`docker build --build-arg LOW_MEMORY=1`, `node:22-slim`, uruchomiony z `--cpus=1 --memory=2g --memory-swap=2g`).

**Wynik.** Działa bez konfiguracji: Turbopack rozpoznaje wyrażenie i emituje fragment `[worker thread]-…` z zależnościami; `import.meta.url` po buildzie wskazuje zasób w `.next/server/assets`. Rozruch wątku 39–84 ms, +17…34 MB RSS w czasie obliczenia (TT 16 MB). `process.availableMemory()` w kontenerze widzi limit cgroup (1892 MB przy `--memory=2g`), `os.freemem()` — hosta.

**Reguła.**
- Wątek twórz wyłącznie literalnym `new Worker(new URL("./plik.ts", import.meta.url), …)` w jednym miejscu (`bot-worker-spawn.ts`); nie składaj ścieżki z zmiennych — bundler jej nie zobaczy.
- Plik wątku uruchamia pętlę tylko dla własnych danych (`workerData.kind`), bo moduł bywa importowany w głównym wątku i w testach (Vitest).
- W testach jednostkowych mockuj `node:worker_threads` i wstrzykuj port; prawdziwy wątek sprawdza test integracyjny na zbudowanej aplikacji. `tsx` też ładuje ten plik (bench), ale rozruch i RSS są wtedy wyższe niż w buildzie — liczb z `tsx` nie porównuj z produkcją.
- `vi.waitFor` przy włączonych fałszywych timerach przesuwa czas: do „poczekaj, aż bramka ruszy” używaj kilku `await Promise.resolve()`.

Powiązane: `.ai/specs/2026-11-05-hosted-bot.md` (faza S04), #262, #263.
