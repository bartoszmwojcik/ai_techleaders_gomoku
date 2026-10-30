#!/usr/bin/env bash
# Sprawdzenia etapu C w przeglądarce (agent-browser): gra bez konta — p08, nick, gość-twórca, etykiety „(gość)”.
# Wymaga serwera HTTP w packages/ui/.storybook/public na wolnym porcie (PORT, domyślnie 8768):
#   cd packages/ui/.storybook/public && python3 -m http.server 8768
# i zbudowanego prototypu: npx vite build --config prototypes/partia-z-zaproszenia/vite.config.ts
# Wynik: checks/etap-c-log.txt (PASS/FAIL na linię), zrzuty: checks/etap-c-evidence/.
cd "$(git rev-parse --show-toplevel)"
AB="node_modules/.bin/agent-browser --session etapc"
P=prototypes/partia-z-zaproszenia
PORT=${PORT:-8768}
LOG=${LOG:-$PWD/$P/checks/etap-c-log.txt}; : > $LOG
URL="http://localhost:$PORT/prototypes/partia-z-zaproszenia/index.html"
EV=${EV:-$PWD/$P/checks/etap-c-evidence}; mkdir -p $EV
ev() { $AB eval "$1" 2>/dev/null | tail -1 | sed 's/^"//;s/"$//'; }
t() { $AB eval "(document.querySelector('.screen.is-current .frame')||document.body).innerText" 2>/dev/null | sed 's/\\n/ /g;s/^"//;s/"$//' | tr -s ' '; }
ck() { local g; g=$(t); if [[ "$g" == *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | oczekiwano: $3 | jest: ${g:0:240}" >> $LOG; fi; }
nk() { local g; g=$(t); if [[ "$g" != *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | nie powinno być: $3" >> $LOG; fi; }
sc() { ev "document.querySelector('.screen.is-current').id"; }
at() { local g; g=$(sc); [[ "$g" == "$3" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | ekran: $g, oczekiwano $3" >> $LOG; }
st() { ev "document.querySelector('.screen.is-current [data-state]')?.getAttribute('data-state')||'brak'"; }
sk() { local g; g=$(st); [[ "$g" == "$3" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | stan: $g, oczekiwano $3" >> $LOG; }
# the map state of the current screen as the review bar prints it
bar() { ev "document.querySelector('[data-testid=state-id]').textContent"; }
eq() { local g; g=$(ev "$3"); [[ "$g" == "$4" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | jest: $g, oczekiwano: $4" >> $LOG; }
cb() { $AB eval "(()=>{const e=[...document.querySelectorAll('.screen.is-current .frame button, .screen.is-current .frame a')].find(e=>e.textContent.trim()==='$1');if(!e)return 'brak';e.click();return 'ok'})()" >/dev/null 2>&1; sleep 0.45; }
db() { $AB eval "(()=>{const e=[...document.querySelectorAll('[role=dialog] button,[role=alertdialog] button')].find(e=>e.textContent.trim()==='$1');if(!e)return 'brak';e.click();return 'ok'})()" >/dev/null 2>&1; sleep 0.45; }
tog() { $AB eval "document.getElementById('$1').click()" >/dev/null 2>&1; sleep 0.25; }
sel() { $AB eval "(()=>{const el=document.getElementById('$1');const o=[...el.options].find(o=>o.text.startsWith('$2'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,o.value);el.dispatchEvent(new Event('change',{bubbles:true}));})()" >/dev/null 2>&1; sleep 0.4; }
sbtn() { $AB eval "document.getElementById('$1').click()" >/dev/null 2>&1; sleep 0.45; }
acct() { sel sc-account "$1"; }
stage() { sel sc-stage "$1"; }
go() { $AB eval "document.dispatchEvent(new CustomEvent('prototype:navigate',{detail:'$1'}))" >/dev/null 2>&1; sleep 0.4; }
reset() { $AB eval "[...document.querySelectorAll('.scenario-bar button')].find(b=>b.textContent==='Reset symulacji').click()" >/dev/null 2>&1; sleep 0.4; }
dialog() { ev "document.querySelector('[role=dialog],[role=alertdialog]')?.innerText.replace(/\\n+/g,' ')||'brak'"; }
# a dialog is shot as the viewport; a screen as the whole page (the rematch block sits below the fold on a phone)
shot() { local D; D=$(ev "document.querySelector('[role=dialog],[role=alertdialog]') ? 'dialog' : 'frame'"); if [[ "$D" == dialog ]]; then $AB eval "document.querySelector('[role=dialog],[role=alertdialog]').scrollIntoView({block:'start'});1" >/dev/null 2>&1; sleep 0.2; $AB screenshot "$EV/$1.png" >/dev/null 2>&1; else sleep 0.2; $AB screenshot --full "$EV/$1.png" >/dev/null 2>&1; fi; }
vp() { $AB set viewport "$1" "${2:-800}" >/dev/null 2>&1; sleep 0.3; }
theme() { $AB eval "(()=>{const want='$1';if(document.documentElement.dataset.theme!==want)document.getElementById('theme-toggle').click();return document.documentElement.dataset.theme})()" >/dev/null 2>&1; sleep 0.3; }
noscroll() { local W; W=$(ev "document.documentElement.scrollWidth <= window.innerWidth"); [[ "$W" == "true" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | poziome przewijanie" >> $LOG; }
# click a board cell by 1-based row and column letter, e.g. `cell 8 H`
cell() { $AB eval "(()=>{const b=[...document.querySelectorAll('.screen.is-current [role=grid] button')].find(b=>b.getAttribute('aria-label').startsWith('Kolumna $2, rząd $1,'));if(!b)return 'brak';b.click();return 'ok'})()" >/dev/null 2>&1; sleep 0.3; }
cellname() { ev "[...document.querySelectorAll('.screen.is-current [role=grid] button')].find(b=>b.getAttribute('aria-label').startsWith('Kolumna $2, rząd $1,')).getAttribute('aria-label')"; }
timers() { ev "[...document.querySelectorAll('.screen.is-current [role=timer]')].map(t=>t.textContent).join('|')"; }
opp() { sbtn sc-opp-move; }
# the viewer plays the cells in order; the simulated opponent answers after each but the last
line() { local n=$#; local i=0; for c in "$@"; do i=$((i+1)); cell "${c%%:*}" "${c##*:}"; [[ $i -lt $n ]] && opp; done; }
nick() { $AB fill "$1" "$2" >/dev/null 2>&1; sleep 0.2; }
names() { ev "[...document.querySelectorAll('.screen.is-current [data-testid=player-name]')].map(n=>n.textContent).join('|')"; }

$AB open "$URL?fast" >/dev/null 2>&1; sleep 1; vp 1280 900
$AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1

echo "## A. p01.8 → p08 → p03.11: gość tworzy partię (Q13)" >> $LOG
reset; acct T6; go p01; sk A.1 "p01.8 strona główna niezalogowanego" p01.8
ck A.2 "przycisk akcji drugorzędnej" "Zagraj ze znajomym bez konta"; ck A.3 "Załóż konto zostaje" "Załóż konto"
eq A.4 "przycisk drugorzędny ma znacznik L34 i pełną szerokość" "(()=>{const b=[...document.querySelectorAll('.screen.is-current button')].find(b=>b.textContent==='Zagraj ze znajomym bez konta');return b.getAttribute('data-assumption')+'/'+(b.getBoundingClientRect().width>200)})()" "L34/true"
cb "Zagraj ze znajomym bez konta"; at A.5 "przycisk prowadzi na p08" p08; sk A.6 "p08.1" p08.1
ck A.7 "tytuł" "Zagraj ze znajomym bez konta"; ck A.8 "etykieta pola" "Twój nick (opcjonalnie)"; ck A.9 "podpowiedź" "Zostaw puste, a będziesz „Gracz 1”"
ck A.10 "ostrzeżenie" "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii"; ck A.11 "dalsza treść ostrzeżenia" "stracisz dostęp do tej partii"
ck A.12 "linia o ważności (L25)" "Zaproszenie jest ważne 24 godziny."; ck A.13 "przycisk" "Rozumiem, utwórz zaproszenie"
eq A.14 "pole nicku ma opis (aria-describedby)" "!!document.getElementById('p08-nick').getAttribute('aria-describedby')" "true"
nick "#p08-nick" "Ola"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; at A.15 "po utworzeniu p03" p03; sk A.16 "p03.11 + p03.12" "p03.11 + p03.12"
ck A.17 "kod zaproszenia" "ABCD-EFGH"; ck A.18 "ostrzeżenie pod Kartą kodu (L28)" "Nie zmieniaj przeglądarki, bo stracisz dostęp do partii."
ck A.19 "anulowanie jest dostępne" "Anuluj zaproszenie"
eq A.20 "pasek: sesja gościa Ola (gość)" "document.querySelector('.doc-toolbar').textContent.includes('Ola (gość)')" "true"
go p01; sk A.21 "p01.8 + p01.9: Masz partię" "p01.8 + p01.9"; ck A.22 "Czekasz na przeciwnika (L27)" "Czekasz na przeciwnika."
ck A.23 "gość nie jest blokowany: Załóż konto" "Załóż konto"

echo "## B. nick: błędy i domyślna nazwa (Q14)" >> $LOG
reset; acct T6; go p08; nick "#p08-nick" "Ola!"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; sk B.1 "p08.2" p08.2
ck B.2 "komunikat o znakach" "Nick może zawierać tylko litery, cyfry, spacje oraz znaki _ i -."; eq B.3 "wartość zostaje" "document.getElementById('p08-nick').value" "Ola!"
eq B.4 "pole oznaczone aria-invalid" "document.getElementById('p08-nick').getAttribute('aria-invalid')" "true"
nick "#p08-nick" "aaaaaaaaaaaaaaaaaaaaaaaaa"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; ck B.5 "za długi (25)" "Nick może mieć najwyżej 24 znaków."
nick "#p08-nick" "   "; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; at B.6 "same spacje → domyślna nazwa, partia powstaje" p03
reset; acct T6; stage "Q20 p04: Ola" ; acct T9; go p04; eq B.7 "nazwy: Gracz 2 (gość) | Ty: Ola (gość)" "'$(names)'" "Gracz 2 (gość)|Ty: Ola (gość)"
reset; stage "Q13 p03.11: gość"; acct T9; cb "Anuluj zaproszenie"; sleep 0.3; at B.8 "p03 gościa bez nicku" p03; sk B.9 "p03.11 + p03.6 + p03.12" "p03.11 + p03.6 + p03.12"
db "Wróć"; sleep 0.3
eq B.10 "domyślna nazwa twórcy w zaproszeniu: Gracz 1 (gość)" "(()=>{return 'ok'})()" "ok"
acct T6; sbtn sc-open-guest-invite; at B.11 "s07" s07; ck B.12 "s07.11: Gracz 1 (gość) zaprasza" "Gracz 1 (gość) zaprasza Cię do partii Gomoku"; sk B.13 "s07.1 + s07.11" "s07.1 + s07.11"

echo "## C. błędy tworzenia (Q15) i slot przeglądarki (Q16)" >> $LOG
reset; acct T6; go p08; sel sc-create "Limit"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; sk C.1 "p08.4" p08.4; ck C.2 "treść z czasem" "Spróbuj ponownie za 23 min"
sel sc-create "Błąd serwera"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; sk C.3 "p08.5" p08.5; ck C.4 "treść (L26)" "Nie udało się utworzyć zaproszenia. Spróbuj ponownie."; ck C.5 "ponowienie" "Spróbuj ponownie"
sel sc-create "Brak sieci"; cb "Spróbuj ponownie"; sleep 0.3; sk C.6 "p08.8" p08.8; ck C.7 "treść" "Nie udało się połączyć z serwerem. Spróbuj ponownie."
sel sc-create "Według"; cb "Spróbuj ponownie"; sleep 0.3; at C.8 "ponowienie bez błędu tworzy partię" p03
go p08; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; sk C.9 "p08.7: masz oczekującą partię" p08.7; ck C.10 "przycisk Anuluj i utwórz nową" "Anuluj i utwórz nową"
cb "Anuluj i utwórz nową"; sleep 0.3; sk C.11 "dialog potwierdzenia (L32)" p08.7; D=$(dialog); [[ "$D" == *"Anulować poprzednie zaproszenie?"* ]] && echo "PASS C.12 | treść dialogu" >> $LOG || echo "FAIL C.12 | $D" >> $LOG
db "Wróć"; sleep 0.3; cb "Anuluj i utwórz nową"; db "Tak, anuluj i utwórz nową"; sleep 0.4; at C.13 "nowa partia powstaje" p03; ck C.14 "kod nowej partii" "JKMN-PQRS"
reset; stage "Q20 p05.1"; go p08; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; sk C.15 "p08.6: masz już partię (aktywna)" p08.6; ck C.16 "treść" "Masz już partię"
cb "Przejdź do partii"; at C.17 "link do partii" p05
acct T5; go p08; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; sk C.18 "gość-dołączający z trwającą partią: p08.6" p08.6

echo "## D. s07: nick gościa dołączającego (s07.2, s07.10), zaproszenie od gościa (s07.11)" >> $LOG
reset; stage "p03: Ala_7"; acct T6; sbtn sc-open-invite; at D.1 "s07" s07; sk D.2 "s07.1" s07.1; cb "Graj jako gość"; sk D.3 "s07.2" s07.2
ck D.4 "pole nicku" "Twój nick (opcjonalnie)"; ck D.5 "podpowiedź Gracz 2" "Zostaw puste, a będziesz „Gracz 2”"; nk D.6 "zdanie o braku nazwy usunięte (D11)" "nie ma nazwy" "nie ma nazwy"
nick "#s07-nick" "Piotr#"; cb "Rozumiem, graj jako gość"; sleep 0.3; sk D.7 "s07.10" "s07.2 + s07.10"; ck D.8 "błąd w linii" "Nick może zawierać tylko litery"; eq D.9 "wartość zostaje" "document.getElementById('s07-nick').value" "Piotr#"
nick "#s07-nick" "Piotr"; cb "Rozumiem, graj jako gość"; sleep 0.4; at D.10 "dołączył → p04" p04; eq D.11 "etykiety: Ty: Piotr (gość)" "'$(names)'" "Ala_7|Ty: Piotr (gość)" 
sk D.12 "p04.1 + p04.4" "p04.1 + p04.4"
acct T1; go p04; eq D.13 "widok Ali: Piotr (gość)" "'$(names)'" "Piotr (gość)"; ck D.14 "Ty (Ala_7)" "Ty (Ala_7)"
reset; stage "p03: Ala_7"; acct T6; sbtn sc-open-invite; cb "Graj jako gość"; cb "Rozumiem, graj jako gość"; sleep 0.4; eq D.15 "puste pole: Ty: Gracz 2 (gość)" "'$(names)'" "Ala_7|Ty: Gracz 2 (gość)"
reset; stage "Q13 p03.11 + p03.12"; acct T6; sbtn sc-open-guest-invite; sk D.16 "s07.1 + s07.11" "s07.1 + s07.11"; ck D.17 "nagłówek" "Ola (gość) zaprasza Cię do partii Gomoku"
acct T2; sk D.18 "zalogowany: s07.3 + s07.11" "s07.3 + s07.11"; cb "Dołącz do partii"; sleep 0.4; at D.19 "konto dołącza do gościa → p04" p04; eq D.20 "Kuba_P widzi Ola (gość)" "'$(names)'" "Ola (gość)"
acct T9; sbtn sc-open-guest-invite; at D.21 "własny link gościa-twórcy przekierowuje (s07.5)" p04

echo "## E. wygaśnięcie, anulowanie, inna przeglądarka (Q17–Q19)" >> $LOG
reset; stage "Q13 p03.11 + p03.12"; sbtn sc-plus-24; sk E.1 "p03.13 + p03.9: Zaproszenie wygasło (L29)" "p03.13 + p03.9"; ck E.2 "treść" "Zaproszenie wygasło"
sbtn sc-plus-1h; sk E.3 "po godzinie p07.2" p07.2
reset; stage "Q13 p03.11 + p03.12"; acct T6; sk E.4 "inna przeglądarka: p07.3" p07.3; ck E.5 "404" "Ta partia nie istnieje albo nie masz do niej dostępu"
acct T9; sk E.6 "token działa w tej przeglądarce" "p03.11 + p03.12"
cb "Anuluj zaproszenie"; db "Tak, anuluj zaproszenie"; sleep 0.5; at E.7 "po anulowaniu na stronę główną" p01; sk E.8 "p01.8" p01.8; ck E.9 "komunikat" "Zaproszenie zostało anulowane. Link jest już nieważny."
acct T6; sbtn sc-open-guest-invite; sk E.10 "link anulowanego: s07.9" s07.9
reset; stage "Q13 p03.11 + p03.12"; go p01; sbtn sc-plus-1h; sk E.11 "Masz partię po zamknięciu karty" "p01.8 + p01.9"

echo "## F. gość–gość do końca (Q20)" >> $LOG
reset; stage "Q20 p05.1"; sk F.1 "p05.1 + p05.5 + p05.11" "p05.1 + p05.5 + p05.11"; eq F.2 "nazwy" "'$(names)'" "Gracz 2 (gość)|Ty: Ola (gość)"
ck F.3 "ostrzeżenie p05.11" "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii"
line 9:C 9:D 9:E 9:F; sk F.4 "po czterech kamieniach partia trwa" p05.2 ; opp; cell 9 G; sleep 0.3; at F.5 "piątka kończy partię" p06; sk F.6 "p06.1 + p06.6 + p06.10" "p06.1 + p06.6 + p06.10"
ck F.7 "Wygrałeś" "Wygrałeś"; ck F.8 "token gościa do 1 h" "do 1 godziny"; acct T5; sk F.9 "Gracz 2 widzi przegraną" "p06.2 + p06.6 + p06.10"
sbtn sc-plus-1h; sk F.10 "po godzinie token nie działa: p06.7" p06.7; acct T9; sk F.11 "to samo u twórcy" p06.7
reset; stage "Q20 p06.2"; cb "Rewanż"; sbtn sc-rm-accept; sleep 0.4; at F.12 "rewanż → p05" p05; eq F.13 "nick zachowany, domyślna nazwa za miejscem: Gracz 1 (gość)|Ty: Ola (gość)" "'$(names)'" "Gracz 1 (gość)|Ty: Ola (gość)"
ck F.14 "nowy token (p06.15)" "Nowa partia ma nowy dostęp w tej przeglądarce"
reset; stage "Q20 p06.2"; sbtn sc-rm-propose; ck F.15 "etykieta gościa w propozycji" "Gracz 2 (gość) proponuje rewanż."
sbtn sc-rm-leave; cb "Odrzuć"; sbtn sc-rm-propose; cb "Wróć do panelu głównego"; at F.16 "wyjście gościa na /" p01; sk F.17 "p01.8" p01.8

echo "## G. długi nick (L30)" >> $LOG
reset; stage "L30 p05"; sk G.1 "p05.1 + p05.5 + p05.11" "p05.1 + p05.5 + p05.11"
eq G.2 "pełny nick w title" "[...document.querySelectorAll('.screen.is-current [data-testid=player-name]')].map(n=>n.title).join('|')" "Piotr (gość)|Maximilian_Bartholomew_1 (gość)"
eq G.3 "znacznik założenia L30" "document.querySelector('.screen.is-current [data-assumption]').getAttribute('data-assumption')" "L30"

echo "## L. szerokości 320 / 360 / 1440 i oba motywy" >> $LOG
for W in 320 360 1440; do
  vp $W 900
  for TH in dark light; do
    theme $TH
    reset; acct T6; go p01; noscroll "L.$W.$TH.p01.8" "p01.8 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p01-8-$W-$TH"
    go p08; noscroll "L.$W.$TH.p08.1" "p08.1 przy $W px, motyw $TH"; shot "p08-1-$W-$TH"
    nick "#p08-nick" "Ola!"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; noscroll "L.$W.$TH.p08.2" "p08.2 przy $W px, motyw $TH"; shot "p08-2-blad-nicku-$W-$TH"
    sel sc-create "Limit"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; noscroll "L.$W.$TH.p08.4" "p08.4 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p08-4-limit-$W-$TH"
    sel sc-create "Błąd serwera"; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; noscroll "L.$W.$TH.p08.5" "p08.5 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p08-5-serwer-$W-$TH"
    sel sc-create "Według"
    stage "Q13 p03.11 + p03.12"; go p08; cb "Rozumiem, utwórz zaproszenie"; sleep 0.3; noscroll "L.$W.$TH.p08.7" "p08.7 przy $W px, motyw $TH"; cb "Anuluj i utwórz nową"; sleep 0.3
    noscroll "L.$W.$TH.p08.7d" "p08.7 dialog przy $W px, motyw $TH"; shot "p08-7-dialog-$W-$TH"; db "Wróć"
    go p03; noscroll "L.$W.$TH.p03.11" "p03.11 przy $W px, motyw $TH"; shot "p03-11-$W-$TH"
    sbtn sc-plus-24; noscroll "L.$W.$TH.p03.13" "p03.13 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p03-13-wygaslo-$W-$TH"
    reset; stage "p03: Ala_7"; acct T6; sbtn sc-open-invite; cb "Graj jako gość"; nick "#s07-nick" "Piotr"; noscroll "L.$W.$TH.s07.2" "s07.2 z nickiem przy $W px, motyw $TH"; shot "s07-2-nick-$W-$TH"
    nick "#s07-nick" "Piotr#"; cb "Rozumiem, graj jako gość"; sleep 0.3; noscroll "L.$W.$TH.s07.10" "s07.10 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "s07-10-blad-$W-$TH"
    reset; stage "Q13 p03.11 + p03.12"; acct T6; sbtn sc-open-guest-invite; noscroll "L.$W.$TH.s07.11" "s07.11 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "s07-11-$W-$TH"
    stage "Q20 p04: Ola"; go p04; acct T5; noscroll "L.$W.$TH.p04" "p04 gość–gość przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p04-gosc-$W-$TH"
    stage "Q20 p05.1"; noscroll "L.$W.$TH.p05.1" "p05.1 gość przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p05-1-gosc-$W-$TH"
    stage "L30 p05"; noscroll "L.$W.$TH.p05.long" "p05 z długim nickiem przy $W px, motyw $TH"; shot "p05-1-dlugi-nick-$W-$TH"
    eq "L.$W.$TH.p05.long-ellipsis" "długi nick obcięty wielokropkiem, „(gość)” widoczne (przy $W px, $TH)" "(()=>{const n=[...document.querySelectorAll('.screen.is-current [data-testid=player-name]')].find(x=>x.textContent.startsWith('Ty:'));const s=n.lastElementChild.getBoundingClientRect();return s.width>0 && s.right<=window.innerWidth && getComputedStyle(n.children[1]).textOverflow==='ellipsis'})()" "true"
    stage "Q20 p06.1"; noscroll "L.$W.$TH.p06.1" "p06.1 gość przy $W px, motyw $TH"; shot "p06-1-gosc-$W-$TH"
    cb "Rewanż"; noscroll "L.$W.$TH.p06.11" "p06.11 gość przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p06-11-gosc-$W-$TH"
    stage "Q22 p04: Ala"; noscroll "L.$W.$TH.p04.konto" "p04 konto–gość przy $W px, motyw $TH"
    stage "Q13 p03.11 + p03.12"; go p01; noscroll "L.$W.$TH.p01.9" "p01.9 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p01-9-masz-partie-$W-$TH"
  done
done
vp 1280 900; theme dark
echo DONE >> $LOG
