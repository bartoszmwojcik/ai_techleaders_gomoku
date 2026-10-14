<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Zasady pracy agentów

Ten plik jest jedynym źródłem instrukcji dla agentów AI. `CLAUDE.md` tylko go importuje — nie dopisuj tam treści.

## Struktura `.ai/`

Wszystkie nowe pliki w `specs/`, `runs/` i `lessons/` muszą mieć nazwę `YYYY-MM-DD-slug.md` (data utworzenia, slug kebab-case). Zachowuj oryginalną datę przy przenoszeniu plików.

| Ścieżka | Przeznaczenie |
| --- | --- |
| `.ai/specs/` | Aktywne specyfikacje SDD (cel, wymagania, kryteria akceptacji, notatki techniczne, status). |
| `.ai/specs/implemented/` | Specyfikacje wdrożone — przenieś tu po spełnieniu kryteriów akceptacji. |
| `.ai/specs/archive/` | Specyfikacje anulowane lub nieaktualne. |
| `.ai/runs/` | Log każdego autonomicznego przebiegu (`/loop`, workflow, cron, długa praca bez nadzoru): cel, kroki z rezultatami, zmiany, błędy, status. |
| `.ai/lessons/` | Pojedyncze lekcje: problem, kontekst, wniosek/reguła, powiązane spec/run. |
| `.ai/lessons.md` | Indeks lekcji — jedna linia na wpis z linkiem do `lessons/…`. Czytany na starcie każdej sesji. |

Nie modyfikuj istniejących plików spoza tej struktury (np. `.ai/specs/product-brief.md`, `.ai/specs/research/`, `.ai/cezar/`) bez wyraźnej prośby.

## Przepływ pracy

1. **Kontekst na start.** Przeczytaj `.ai/lessons.md` i specyfikacje w `.ai/specs/` dotyczące zadania. Specyfikacja jest źródłem prawdy dla wymagań.
2. **Planuj złożone zadania.** Zadanie wieloetapowe, dotykające kilku plików lub z kilkoma możliwymi podejściami zaczynaj od planu (plan mode / specyfikacja w `.ai/specs/`), nie od kodu. Dopracuj plan tak, by implementacja mogła przejść za jednym razem; przy większych zmianach poproś drugiego agenta o krytyczny przegląd planu.
3. **Gdy coś idzie źle — wróć do planowania.** Nie forsuj implementacji, która się rozjeżdża. Zatrzymaj się, zaktualizuj plan/specyfikację i dopiero wtedy kontynuuj.
4. **Weryfikuj każdą zmianę, zanim uznasz ją za gotową.** Minimum: `npm run lint` i `npm run build` (sprawdza też typy). Zmiany UI sprawdź w działającej aplikacji (`npm run dev`), łącznie z przypadkami brzegowymi. Odhacz kryteria akceptacji ze specyfikacji. Jeśli czegoś nie dało się zweryfikować — napisz to wprost.
5. **Po poprawce użytkownika zapisz lekcję.** Każda korekta (zła decyzja, błąd, zignorowana konwencja) kończy się wpisem w `.ai/lessons/YYYY-MM-DD-slug.md` z konkretną regułą, która zapobiegnie powtórce, oraz linią w `.ai/lessons.md`. To samo po naprawieniu nietrywialnego błędu. Jeśli reguła dotyczy wszystkich zadań, dopisz ją też do tego pliku.
6. **Naprawiaj błędy samodzielnie.** Mając raport błędu, nieprzechodzący test lub logi — znajdź przyczynę i napraw ją bez dopytywania o podejście. Pytaj tylko o decyzje, które naprawdę należą do użytkownika.
7. **Wybieraj eleganckie rozwiązanie.** Jeśli poprawka wyszła prowizoryczna, odrzuć ją i zaimplementuj czyste rozwiązanie z wykorzystaniem tego, czego się nauczyłeś — zamiast nakładać kolejne łatki.
8. **Używaj subagentów** do researchu, przeszukiwania kodu i równoległych, niezależnych analiz, żeby główny kontekst pozostał czysty. Niezależne zadania można prowadzić równolegle w osobnych git worktree.
9. **Automatyzuj powtarzalne czynności.** Coś, co robisz wielokrotnie, zaproponuj jako skill lub komendę w `.claude/` (commitowaną do repozytorium).
10. **Loguj przebiegi autonomiczne** w `.ai/runs/` — na bieżąco lub najpóźniej na końcu przebiegu, także gdy zakończył się błędem.
