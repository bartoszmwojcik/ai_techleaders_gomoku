# Numer zgłoszenia `#NNN` w komentarzu `.tsx`/`.css` wywala job „Wartości spoza tokenów”

- **Problem:** komentarz `// … (#152)` w pliku `.tsx` pasuje do wyrażenia `#[0-9a-fA-F]{3,8}\b` (cyfry to też hex) w kroku `grep` joba `tokens` w `.github/workflows/ci.yml`, więc CI jest czerwone, choć `npm run check` lokalnie przechodzi (ten krok nie jest częścią `npm run check`).
- **Reguła:** w `packages/app/src` i `packages/ui/src/game` (`*.tsx`, `*.css`) nie pisz `#<cyfry>` w komentarzach i stringach — używaj „issue 152”. Przed pushem uruchom `grep -rnE '#[0-9a-fA-F]{3,8}\b' packages/app/src packages/ui/src/game --include='*.tsx' --include='*.css'`.
- **Powiązane:** PR #154 (zgłoszenie #152).
