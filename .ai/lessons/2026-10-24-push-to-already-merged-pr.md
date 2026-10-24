# Commit wypchnięty po merge'u PR nie trafia do `main`

**Problem.** Drugi commit (wyniki przesłuchania specyfikacji #19) dopisałem do brancha PR #40 i zgłosiłem jako „dopisany do PR #40”. Właściciel zmergował PR (squash) kilka minut wcześniej, więc do `main` trafił tylko pierwszy commit. Zauważyłem to dopiero po usunięciu brancha; commit odzyskałem cherry-pickiem (PR #41).

**Kontekst.** Squash merge bierze stan brancha z chwili merge'u. `git push` na branch zmergowanego PR-a kończy się sukcesem, a GitHub nie ostrzega — PR pozostaje `MERGED`, nowy commit wisi tylko na branchu.

**Reguła.**
- Przed dopisaniem commita do istniejącego PR sprawdź `gh pr view <n> --json state` — przy `MERGED` lub `CLOSED` zrób nowy branch od `origin/main` i nowy PR.
- Po merge'u, zanim usuniesz branch, porównaj `headRefOid` zmergowanego PR z lokalnym `HEAD` brancha; różnica = niezmergowane commity do przeniesienia.
- Nie raportuj „dopisane do PR” bez sprawdzenia stanu PR po `push`.

Powiązane: PR #40, PR #41.
