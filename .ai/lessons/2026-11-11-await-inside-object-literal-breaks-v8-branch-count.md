# `await` w literale obiektu psuje liczenie gałęzi v8

**Problem.** W `ShowService.#stateOf` (E14-S02, #282) pole `drive: { botOnTurn, stalled: botOnTurn && (await this.#stalled(…)) }` dało 98% gałęzi przy wszystkich przypadkach pokrytych testami. Raport lcov pokazał gałąź z licznikiem **ujemnym** (`BRDA:371,21,1,-2`) na linii za literałem — artefakt v8 przy `await` wewnątrz wyrażenia w literale obiektu, nie brakujący test.

**Reguła.** Gdy pokrycie gałęzi spada bez widocznej przyczyny, wygeneruj `--coverage.reporter=lcovonly` i poszukaj w `BRDA` liczników `0` **albo ujemnych**. `await` wyciągaj przed literał (`const stalled = botOnTurn ? await f() : false;`), zamiast osadzać go w `&&`/`?:` wewnątrz obiektu; nie dopisuj sztucznych testów ani `v8 ignore`.

Powiązane: `.ai/specs/implemented/2026-11-09-show-mode.md` (E14-S02), `.ai/runs/2026-11-11-e14-s02-show-drive.md`.
