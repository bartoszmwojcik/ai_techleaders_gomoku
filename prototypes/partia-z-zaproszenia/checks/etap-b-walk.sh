#!/usr/bin/env bash
# Sprawdzenia etapu B w przeglądarce (agent-browser): plansza, reguły, zegar, wynik, poddanie, rewanż, powrót, p07.
# Wymaga serwera HTTP w packages/ui/.storybook/public na wolnym porcie (domyślnie 8767):
#   cd packages/ui/.storybook/public && python3 -m http.server 8767
# i zbudowanego prototypu: npx vite build --config prototypes/partia-z-zaproszenia/vite.config.ts
# Wynik: checks/etap-b-log.txt (PASS/FAIL na linię), zrzuty: checks/etap-b-evidence/.
cd "$(git rev-parse --show-toplevel)"
AB="node_modules/.bin/agent-browser --session etapb"
P=prototypes/partia-z-zaproszenia
PORT=${PORT:-8767}
LOG=${LOG:-$PWD/$P/checks/etap-b-log.txt}; : > $LOG
URL="http://localhost:$PORT/prototypes/partia-z-zaproszenia/index.html"
EV=${EV:-$PWD/$P/checks/etap-b-evidence}; mkdir -p $EV
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

$AB open "$URL?fast" >/dev/null 2>&1; sleep 1; vp 1280 900
$AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1
sel sc-draw "Ty czarne"

echo "## A. p04 → p05: plansza i losowanie koloru" >> $LOG
reset; stage "p04.2"; sk A.1 "p04.2 partia gotowa" p04.2
sel sc-draw "Ty czarne"; cb "Przejdź do planszy"; at A.2 "Przejdź do planszy → p05" p05; sk A.3 "p05.1 + p05.5 (mysz, Twój ruch)" "p05.1 + p05.5"
eq A.4 "plansza ma role=grid i 225 pól" "document.querySelectorAll('.screen.is-current [role=grid] button').length + '/' + document.querySelectorAll('.screen.is-current [role=gridcell]').length" "225/225"
ck A.5 "Twój ruch (czarne)" "Twój ruch (czarne)"; ck A.6 "Grasz czarnymi." "Grasz czarnymi."; ck A.7 "komunikat losowania (L15)" "Wylosowano: Ty grasz czarnymi."
eq A.8 "zegary 10:00 | 10:00" "document.querySelector('.screen.is-current [role=timer]') && '$(timers)'" "10:00|10:00"
eq A.9 "pole ma opis dla czytnika" "'$(cellname 8 H)'" "Kolumna H, rząd 8, puste"
eq A.10 "pasek pokazuje stan" "document.querySelector('[data-testid=state-id]').textContent" "Stan: p05.1 + p05.5"
ck A.11 "przeciwnik Kuba_P i Ty (Ala_7)" "Kuba_P"; ck A.12 "nazwa gracza" "Ty (Ala_7)"
reset; stage "p04.2"; sel sc-draw "Ty białe"; cb "Przejdź do planszy"; sk A.13 "losowanie: Ty białe → p05.2" p05.2; ck A.14 "Grasz białymi." "Grasz białymi."
sel sc-draw "Ty czarne"

echo "## B. ruchy myszą, naprzemienność, błędy ruchu" >> $LOG
reset; stage "p05.1"; cell 8 H; sk B.1 "ruch wysłany → p05.2" p05.2; eq B.2 "kamień na polu H8" "'$(cellname 8 H)'" "Kolumna H, rząd 8, czarny kamień"
ck B.3 "Ruch przeciwnika" "Ruch przeciwnika"; nk B.4 "komunikat losowania znika po pierwszym ruchu" "Wylosowano" "Wylosowano"
eq B.5 "plansza tylko do odczytu w turze przeciwnika" "document.querySelector('.screen.is-current [role=grid]').getAttribute('aria-readonly')" "true"
cell 9 I; eq B.6 "kliknięcie w turze przeciwnika nic nie stawia" "'$(cellname 9 I)'" "Kolumna I, rząd 9, puste"
eq B.7 "zegar przeciwnika biegnie (jego zegar na dole stoi): górny|dolny" "'$(timers)'" "10:00|10:00"
opp; sk B.8 "przeciwnik zagrał → p05.1 + p05.5" "p05.1 + p05.5"; eq B.9 "jego kamień biały" "document.querySelectorAll('.screen.is-current [role=grid] button[aria-label\$=\"biały kamień\"]').length" "1"
sel sc-move "Błąd sieci"; cell 9 I; sk B.10 "błąd sieci → p05.1 + p05.7" "p05.1 + p05.7"; ck B.11 "treść błędu" "Nie udało się połączyć z serwerem. Spróbuj ponownie."
eq B.12 "ruch nie został zapisany" "'$(cellname 9 I)'" "Kolumna I, rząd 9, puste"
cb "Spróbuj ponownie"; sk B.13 "ponowienie tego samego ruchu → p05.2" p05.2; eq B.14 "kamień na I9" "'$(cellname 9 I)'" "Kolumna I, rząd 9, czarny kamień"
opp; sel sc-move "Nieaktualny"; cell 10 J; sk B.15 "STALE_MOVE → p05.8" "p05.1 + p05.8 + p05.5"; ck B.16 "treść" "Plansza była nieaktualna i została odświeżona. Spróbuj ponownie."
sel sc-move "Nie Twoja"; cell 10 J; ck B.17 "NOT_YOUR_TURN: treść" "Teraz ruch przeciwnika. Plansza została odświeżona."; sk B.18 "p05.2 + p05.8" "p05.2 + p05.8"
opp; sel sc-move "Pole zajęte"; cell 11 K; sk B.19 "CELL_OCCUPIED → p05.9" "p05.1 + p05.9 + p05.5"; ck B.20 "treść" "To pole jest już zajęte"
cell 11 L; sleep 0.3; nk B.21 "komunikat znika po następnym ruchu" "To pole jest już zajęte" "To pole jest już zajęte"

echo "## C. klawiatura i dotyk" >> $LOG
reset; stage "p05.1"
eq C.1 "dokładnie jedno pole z tabindex=0 (roving)" "document.querySelectorAll('.screen.is-current [role=grid] button[tabindex=\"0\"]').length" "1"
$AB eval "document.querySelector('.screen.is-current [role=grid] button[tabindex=\"0\"]').focus()" >/dev/null 2>&1
FIRST=$(ev "document.activeElement.getAttribute('aria-label')"); $AB press ArrowRight >/dev/null 2>&1; $AB press ArrowDown >/dev/null 2>&1
SECOND=$(ev "document.activeElement.getAttribute('aria-label')")
[[ -n "$FIRST" && "$FIRST" != "$SECOND" && "$SECOND" == Kolumna* ]] && echo "PASS C.2 | strzałki przesuwają fokus: $FIRST → $SECOND" >> $LOG || echo "FAIL C.2 | $FIRST → $SECOND" >> $LOG
eq C.3 "nadal jedno pole z tabindex=0" "document.querySelectorAll('.screen.is-current [role=grid] button[tabindex=\"0\"]').length" "1"
$AB press Enter >/dev/null 2>&1; sleep 0.4; sk C.4 "Enter stawia kamień → p05.2" p05.2
reset; stage "p05.1"; sel sc-input "Dotyk"; ck C.5 "przycisk Postaw kamień" "Postaw kamień"; ck C.6 "podpowiedź" "Dotknij przecięcia, żeby je zaznaczyć."
eq C.7 "Postaw kamień wyłączony bez zaznaczenia" "[...document.querySelectorAll('.screen.is-current button')].find(b=>b.textContent==='Postaw kamień').disabled" "true"
cell 8 H; sk C.8 "pierwsze dotknięcie zaznacza → p05.4" "p05.1 + p05.4"; ck C.9 "opis zaznaczenia" "Zaznaczono: Kolumna H, rząd 8. Naciśnij „Postaw kamień”."
eq C.10 "zaznaczenie nie stawia kamienia" "'$(cellname 8 H)'" "Kolumna H, rząd 8, puste"
cell 9 I; ck C.11 "zaznaczenie się przesuwa" "Kolumna I, rząd 9"; cb "Postaw kamień"; sk C.12 "Postaw kamień → p05.2" p05.2; eq C.13 "kamień na I9" "'$(cellname 9 I)'" "Kolumna I, rząd 9, czarny kamień"
opp; cell 10 J; cell 10 J; sk C.14 "drugie dotknięcie tego samego pola wysyła" p05.2
sel sc-input "Mysz"

echo "## D. prawdziwe wygrane na 4 osiach, sześć w linii" >> $LOG
winrow() { # name, cells...: four moves keep the game open, the fifth wins
  local name=$1; shift; reset; stage "p05.1"; line "${@:1:4}"; sk "$name.a" "po czterech kamieniach partia trwa" "p05.2"
  opp; cell "${5%%:*}" "${5##*:}"; sleep 0.2; at "$name.b" "piąty kamień kończy partię → p06" p06; sk "$name.c" "p06.1 + p06.10" "p06.1 + p06.10"
  eq "$name.d" "podświetlone 5 pól linii" "document.querySelectorAll('.screen.is-current [role=grid] span.outline-4').length" "5"; ck "$name.e" "baner Wygrałeś" "Wygrałeś"
}
winrow D1 9:C 9:D 9:E 9:F 9:G
winrow D2 9:L 10:L 11:L 12:L 13:L
winrow D3 8:C 9:D 10:E 11:F 12:G
winrow D4 8:M 9:L 10:K 11:J 12:I
eq D5 "po końcu plansza jest tylko do odczytu" "document.querySelector('.screen.is-current [role=grid]').getAttribute('aria-readonly')" "true"
reset; stage "p05.1"; line 9:C 9:D 9:F 9:G; opp; cell 9 H; sk D7.a "XX_XXX: przerwa trzyma partię" p05.2; opp; cell 9 E; at D7.b "uzupełnienie daje sześć w linii (swobodne gomoku)" p06
eq D7.c "podświetlone 6 pól" "document.querySelectorAll('.screen.is-current [role=grid] span.outline-4').length" "6"
reset; stage "p05.2"; sel sc-pattern "Piątka"; opp; cell 5 C; opp; cell 7 E; opp; cell 5 G; opp; cell 7 I; opp; sleep 0.3
at D8.a "przeciwnik układa pięć w rzędzie → p06" p06; sk D8.b "p06.2 + p06.10" "p06.2 + p06.10"; ck D8.c "treść" "Przeciwnik ułożył pięć kamieni w jednej linii."; sel sc-pattern "Rozproszone"
reset; stage "p05.1"; sbtn sc-almost-full; eq D9.a "jedno wolne pole" "document.querySelectorAll('.screen.is-current [role=grid] button[aria-label\$=\"puste\"]').length" "1"
$AB eval "document.querySelector('.screen.is-current [role=grid] button[aria-label\$=\"puste\"]').click()" >/dev/null 2>&1; sleep 0.4
sk D9.b "ostatnie pole kończy partię remisem (prawdziwe wykrycie)" "p06.4 + p06.10"; ck D9.c "baner Remis" "Remis"
eq D9.d "bez linii wygrywającej" "document.querySelectorAll('.screen.is-current [role=grid] span.outline-4').length" "0"

echo "## E. zegar: stoi, skacze, mało czasu, odliczanie, czas minął" >> $LOG
reset; stage "p05.1"; eq E.1 "zegary stoją: 10:00|10:00" "'$(timers)'" "10:00|10:00"
sbtn sc-plus-5; sleep 0.2; eq E.2 "czas demo +5 min zabiera zegarowi gracza na ruchu (BR-05): 10:00|5:00" "'$(timers)'" "10:00|5:00"
sbtn sc-back; sbtn sc-clock-50; sk E.3 "Skocz do 0:50 → p05.3" "p05.1 + p05.3 + p05.5"; eq E.4 "zegar 0:50" "'$(timers)'" "10:00|0:50"
nk E.5 "bez tekstu „Mało czasu”" "Mało czasu" "Mało czasu"
eq E.6 "obrys 4 px w kolorze ostrzegawczym" "getComputedStyle(document.querySelector('.screen.is-current [data-testid=clock-creator] > div')).borderTopWidth" "4px"
eq E.7 "ukryty komunikat ogłasza raz" "document.querySelector('.screen.is-current [data-testid=low-live]').textContent" "Zostało mniej niż minuta"
eq E.8 "brak elementów audio" "document.querySelectorAll('audio').length" "0"
sbtn sc-clock-60; eq E.9 "+1 min: 1:50" "'$(timers)'" "10:00|1:50"; eq E.10 "powyżej minuty bez obrysu" "document.querySelector('.screen.is-current [data-testid=clock-creator]').hasAttribute('data-low')" "false"
sel sc-clock-target "Przeciwnika"; sbtn sc-clock-50; eq E.11 "zegar przeciwnika <60 s" "document.querySelector('.screen.is-current [data-testid=clock-opponent]').hasAttribute('data-low')" "true"; sel sc-clock-target "Mojego"
reset; stage "p05.1"; tog sc-autoclock; sel sc-speed "x30"; sleep 2.2; T=$(timers); [[ "$T" == "10:00|"* && "$T" != "10:00|10:00" ]] && echo "PASS E.12 | Odliczaj zegar x30: tyka zegar gracza na ruchu ($T)" >> $LOG || echo "FAIL E.12 | $T" >> $LOG
sleep 20; at E.13 "po 10 minutach demo: przegrana na czas → p06" p06; sk E.14 "p06.3 + p06.10" "p06.3 + p06.10"; ck E.15 "treść" "Przegrałeś — skończył się Twój czas"
sleep 0.4; eq E.16 "odliczanie wyłącza się samo po końcu" "document.getElementById('sc-autoclock').checked" "false"
reset; stage "p05.1"; sbtn sc-clock-0; sk E.17 "Minął czas (mój) → p06.3" "p06.3 + p06.10"
reset; stage "p05.1"; sel sc-clock-target "Przeciwnika"; sbtn sc-clock-0; sk E.18 "Minął czas (przeciwnika) → p06.1" "p06.1 + p06.10"; ck E.19 "treść" "Wygrałeś — przeciwnikowi skończył się czas"; sel sc-clock-target "Mojego"
reset; stage "p05.1"; sbtn sc-plus-1h; sk E.20 "leniwe rozstrzygnięcie: +1 h demo, nikt nie patrzył → p06.3" "p06.3 + p06.10"

echo "## F. karta w tle i powrót (#24)" >> $LOG
reset; stage "p05.1"; sbtn sc-bg-20
sleep 0.2; eq F.3 "po 20 s zegar mniejszy o nieobecność: 9:40" "'$(timers)'" "10:00|9:40"; nk F.4 "bez „Wróciłeś” po 20 s" "Wróciłeś" "Wróciłeś"
sbtn sc-bg-45; sleep 1.2; sk F.5 "po 45 s: p05.10" "p05.1 + p05.10 + p05.5"; ck F.6 "komunikat z zegarem" "Wróciłeś do partii. Twój zegar: 8:55."
cell 8 H; sleep 0.3; nk F.7 "komunikat znika po ruchu" "Wróciłeś" "Wróciłeś"
reset; stage "p05.1"; sbtn sc-clock-50; sbtn sc-bg-45; sleep 1.2; sbtn sc-bg-45; sleep 1.2; sk F.8 "czas wyczerpał się podczas nieobecności → od razu wynik" "p06.3 + p06.10"; nk F.8b "bez „Wróciłeś”" "Wróciłeś" "Wróciłeś"
reset; stage "p05.2"; tog sc-pollerr; sleep 3.6; sk F.9 "błąd odpytywania w partii po 3 próbach → p05.7" "p05.2 + p05.7"; ck F.10 "baner" "Nie udało się sprawdzić stanu partii"
cb "Sprawdź teraz"; tog sc-pollerr; sleep 1.2; sk F.11 "po ustąpieniu błędu p05.2" p05.2

echo "## G. poddanie" >> $LOG
reset; stage "p05.1"; cb "Poddaj partię"; sleep 0.4; sk G.1 "dialog → p05.13" "p05.1 + p05.5 + p05.13"; D=$(dialog)
[[ "$D" == *"Czy na pewno chcesz się poddać?"* && "$D" == *"Przeciwnik wygra partię."* ]] && echo "PASS G.2 | treść dialogu poddania" >> $LOG || echo "FAIL G.2 | $D" >> $LOG
A=$(ev "document.activeElement.textContent"); [[ "$A" == "Wróć do gry" ]] && echo "PASS G.3 | fokus zaczyna na „Wróć do gry”" >> $LOG || echo "FAIL G.3 | $A" >> $LOG
$AB press Tab >/dev/null 2>&1; $AB press Tab >/dev/null 2>&1; A=$(ev "document.activeElement.closest('[role=alertdialog]') ? 'w dialogu' : 'poza dialogiem'"); [[ "$A" == "w dialogu" ]] && echo "PASS G.4 | fokus zamknięty w dialogu" >> $LOG || echo "FAIL G.4 | $A" >> $LOG
shot dialog-poddania-1440-dark
$AB press Escape >/dev/null 2>&1; sleep 0.5; D=$(dialog); [[ "$D" == brak ]] && echo "PASS G.5 | Esc zamyka dialog" >> $LOG || echo "FAIL G.5 | $D" >> $LOG
A=$(ev "document.activeElement.textContent"); [[ "$A" == "Poddaj partię" ]] && echo "PASS G.6 | fokus wraca na przycisk „Poddaj partię”" >> $LOG || echo "FAIL G.6 | $A" >> $LOG
cb "Poddaj partię"; db "Wróć do gry"; at G.7 "Wróć do gry zostawia partię" p05
cb "Poddaj partię"; db "Poddaj partię"; sleep 0.3; at G.8 "potwierdzenie → p06" p06; sk G.9 "p06.9 + p06.10" "p06.9 + p06.10"; ck G.10 "treść" "Przegrałeś, poddałeś partię"
reset; stage "p05.2"; tog sc-resign-err; cb "Poddaj partię"; db "Poddaj partię"; sleep 0.4
D=$(dialog); [[ "$D" == *"Nie udało się połączyć z serwerem. Spróbuj ponownie."* && "$D" == *"Spróbuj ponownie"* ]] && echo "PASS G.11 | błąd sieci przy poddaniu: alert w dialogu i „Spróbuj ponownie”" >> $LOG || echo "FAIL G.11 | $D" >> $LOG
sk G.12 "p05.7 przy błędzie poddania" "p05.2 + p05.7 + p05.13"; shot dialog-poddania-blad-1440-dark
db "Spróbuj ponownie"; sleep 0.3; at G.13 "ponowienie kończy poddaniem → p06" p06; sk G.14 "p06.9" "p06.9 + p06.10"
reset; stage "p05.1"; sbtn sc-opp-resign; at G.15 "przeciwnik poddał się → p06" p06; sk G.16 "p06.8 + p06.10" "p06.8 + p06.10"; ck G.17 "treść" "Wygrałeś, przeciwnik poddał partię"

echo "## H. wynik: skróty, odświeżenie, gość" >> $LOG
reset; stage "p05.1"; sbtn sc-show-win; sk H.1 "Pokaż wygraną → p06.1" "p06.1 + p06.10"; eq H.2 "linia: 5 pól" "document.querySelectorAll('.screen.is-current [role=grid] span.outline-4').length" "5"
sbtn sc-reload; sk H.3 "odśwież stronę → p06.5" "p06.1 + p06.5 + p06.10"; ck H.4 "komunikat" "Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy."
reset; stage "p05.2"; sbtn sc-show-loss; sk H.5 "Pokaż przegraną (białe) → p06.2" "p06.2 + p06.10"; eq H.6 "linia 5 pól" "document.querySelectorAll('.screen.is-current [role=grid] span.outline-4').length" "5"
reset; stage "p05.1"; sbtn sc-show-draw; sk H.7 "Pokaż remis → p06.4" "p06.4 + p06.10"; eq H.8 "pełna plansza" "document.querySelectorAll('.screen.is-current [role=grid] button[aria-label\$=\"puste\"]').length" "0"
reset; stage "p05.11"; sk H.9 "gość: p05.11" "p05.1 + p05.5 + p05.11"; ck H.10 "ostrzeżenie dla gościa" "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii"; ck H.11 "gość ma domyślną nazwę „Gracz 2 (gość)”" "Ty: Gracz 2 (gość)"
sbtn sc-show-loss; sk H.12 "p06.6 po końcu" "p06.2 + p06.6 + p06.10"; ck H.13 "wynik do 1 h" "Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii."
sbtn sc-plus-1h; sk H.14 "po 1 h token nie działa: p06.7 (404)" p06.7; ck H.15 "ten sam 404" "Ta partia nie istnieje albo nie masz do niej dostępu"
acct T1; sk H.16 "konto twórcy widzi wynik bez limitu" "p06.1 + p06.10"
reset; stage "p05.11"; acct T1; ck H.17 "twórca widzi przeciwnika „Gracz 2 (gość)”" "Gracz 2 (gość)"

echo "## I. rewanż" >> $LOG
reset; stage "p06.2"; sk I.1 "p06.2 + p06.10" "p06.2 + p06.10"; ck I.2 "zapowiedź odwróconych kolorów" "Rewanż to nowa partia z odwróconymi kolorami: zagrasz białymi."
cb "Rewanż"; sk I.3 "propozycja → p06.11" "p06.2 + p06.11"; ck I.4 "treść" "Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min)."; shot rewanz-zaproponowany-1440-dark
cb "Wycofaj propozycję"; sk I.5 "wycofanie → p06.10" "p06.2 + p06.10"
cb "Rewanż"; sbtn sc-rm-accept; at I.6 "przeciwnik przyjmuje → nowa partia p05" p05; sk I.7 "p05.2 (kolory odwrócone: Ala_7 gra teraz białymi)" "p05.2"; ck I.8 "komunikat o zamianie kolorów" "Rewanż: kolory zostały zamienione. Grasz białymi."
eq I.9 "zegary 10:00" "'$(timers)'" "10:00|10:00"; eq I.10 "pusta plansza" "document.querySelectorAll('.screen.is-current [role=grid] button[aria-label\$=\"kamień\"]').length" "0"
sbtn sc-show-loss; cb "Rewanż"; sbtn sc-rm-accept; sk I.11 "kolejny rewanż odwraca kolory ponownie (Ala_7 czarne → p05.1)" "p05.1 + p05.5"
reset; stage "p06.2"; sbtn sc-rm-propose; sk I.12 "przeciwnik proponuje → p06.12" "p06.2 + p06.12"; ck I.13 "treść" "Kuba_P proponuje rewanż. Kolory zostaną zamienione."; shot rewanz-oferta-1440-dark
cb "Odrzuć"; sk I.14 "Odrzuć → p06.10" "p06.2 + p06.10"; ck I.15 "komunikat" "Odrzuciłeś propozycję rewanżu."
sbtn sc-rm-propose; cb "Przyjmij"; sleep 0.4; at I.16 "Przyjmij → nowa partia p05" p05
reset; stage "p06.2"; tog sc-rm-conflict; sbtn sc-rm-propose; cb "Przyjmij"; sleep 0.4; ck I.17 "BR-13: 409 Masz już partię" "Masz już partię"; sk I.18 "nadal p06.12" "p06.2 + p06.12"
cb "Przejdź do partii"; D=$(dialog); [[ "$D" == *"Poza tym prototypem"* ]] && echo "PASS I.19 | link do innej partii → Poza tym prototypem" >> $LOG || echo "FAIL I.19 | $D" >> $LOG; db "Wróć do prototypu"; tog sc-rm-conflict
reset; stage "p06.2"; cb "Rewanż"; sbtn sc-rm-decline; sk I.20 "odrzucone → p06.13 od razu" "p06.2 + p06.13"; ck I.21 "treść" "Zaproszenie do rewanżu odrzucone"; shot rewanz-odrzucony-1440-dark
cb "Wróć do panelu głównego"; at I.22 "po kliknięciu panel główny" p01
reset; stage "p06.2"; cb "Rewanż"; sbtn sc-rm-leave; ck I.23 "przeciwnik wyszedł" "Przeciwnik wyszedł do panelu głównego."
reset; stage "p06.2"; cb "Rewanż"; sbtn sc-plus-5; sk I.24 "po 5 min → p06.14" "p06.2 + p06.14"; ck I.25 "treść" "Zaproszenie do rewanżu wygasło (po 5 minutach)."
cb "Zaproponuj ponownie"; sk I.26 "Zaproponuj ponownie → p06.10" "p06.2 + p06.10"
reset; stage "p06.2"; cb "Rewanż"; cb "Wróć do panelu głównego"; at I.27 "wyjście z własną propozycją → panel" p01
reset; stage "p05.11"; sbtn sc-show-loss; sbtn sc-rm-propose; sk I.28 "gość: p06.15 przy ofercie" "p06.2 + p06.6 + p06.12 + p06.15"; ck I.29 "informacja o nowym dostępie" "Jako gość dostaniesz nowy dostęp do nowej partii w tej przeglądarce."
cb "Przyjmij"; sleep 0.4; at I.30 "gość w nowej partii → p05" p05; ck I.31 "nowy token: Rozumiem" "Nowa partia ma nowy dostęp w tej przeglądarce"; sk I.32 "p06.15 na planszy nowej partii (kolory zamienione: gość gra białymi)" "p05.2 + p05.11 + p06.15"
shot rewanz-goscia-token-1440-dark; cb "Rozumiem"; nk I.33 "Rozumiem zamyka komunikat" "Nowa partia ma nowy dostęp" "Nowa partia ma nowy dostęp"

echo "## J. p07: błędy dostępu" >> $LOG
reset; stage "p05.1"; tog sc-dbdown; sk J.1 "baza niedostępna → p07.4" p07.4; ck J.2 "treść" "Nie udało się połączyć z serwerem. Spróbuj ponownie."
cb "Spróbuj ponownie"; ck J.3 "ponowienie nadal błąd" "serwer nadal nie odpowiada"; tog sc-dbdown; sk J.4 "po ustąpieniu wraca plansza" "p05.1 + p05.5"
acct T7; sk J.5 "spoza partii: p07.2" p07.2; ck J.6 "treść 404" "Ta partia nie istnieje albo nie masz do niej dostępu"
acct T6; sk J.7 "niezalogowany: p07.2" p07.2
reset; stage "p05.11"; sbtn sc-other-browser; sk J.8 "gość w innej przeglądarce → p07.3" p07.3; ck J.9 "to samo 404" "Ta partia nie istnieje albo nie masz do niej dostępu"
sbtn sc-plus-5; sbtn sc-guest-browser; eq J.10 "zegar biegł mimo 404 (BR-06): 10:00|5:00" "'$(timers)'" "10:00|5:00"
reset; stage "p05.1"; go p01; tog sc-slow; go p05; sk J.11 "wolne ładowanie → p07.1" p07.1; eq J.12 "szkielet z aria-busy" "document.querySelectorAll('.screen.is-current [aria-busy=true]').length > 0" "true"; shot p07-1-ladowanie-1440-dark
sleep 1; sk J.13 "po chwili plansza" "p05.1 + p05.5"; tog sc-slow
reset; go p07; sk J.14 "ekran p07 bez dostępu: p07.2" p07.2
stage "p05.1"; go p07; ck J.15 "z dostępem: informacja" "Masz dostęp do tej partii"
reset; acct T7; go p05; sk J.16 "p05 bez partii: p07.2" p07.2; go p06; sk J.17 "p06 bez partii: p07.2" p07.2

echo "## K. serwer z opóźnieniem: ruch w drodze, poddanie w toku (bez ?fast)" >> $LOG
$AB open "$URL" >/dev/null 2>&1; sleep 1; vp 1280 900; $AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1
stage "p05.1"; sleep 0.8; $AB eval "[...document.querySelectorAll('.screen.is-current [role=grid] button')].find(b=>b.getAttribute('aria-label').startsWith('Kolumna H, rząd 8,')).click()" >/dev/null 2>&1; sk K.1 "ruch w drodze → p05.6" "p05.1 + p05.6"; ck K.2 "Wysyłanie ruchu…" "Wysyłanie ruchu…"; shot p05-6-wysylanie-1440-dark
sleep 0.9; sk K.3 "po odpowiedzi p05.2" p05.2
opp; $AB eval "document.getElementById('sc-bg-20').click()" >/dev/null 2>&1; sk K.3a "karta w tle → p05.12 (opóźnienie 0,8 s)" "p05.1 + p05.12 + p05.5"; ck K.3b "odpytywanie wstrzymane" "Karta w tle: odpytywanie wstrzymane."; shot p05-12-karta-w-tle-1440-dark
sleep 1; sk K.3c "po powrocie bez komunikatu (20 s)" "p05.1 + p05.5"; cell 9 I; sleep 0.9
cb "Poddaj partię"; sleep 0.4; $AB eval "[...document.querySelectorAll('[role=alertdialog] button')].find(e=>e.textContent.trim()==='Poddaj partię').click()" >/dev/null 2>&1; sleep 0.2; D=$(dialog); [[ "$D" == *"Poddawanie…"* ]] && echo "PASS K.4 | poddanie w toku: Poddawanie…" >> $LOG || echo "FAIL K.4 | $D" >> $LOG
sk K.5 "p05.14" "p05.2 + p05.13 + p05.14"; sleep 1.2; at K.6 "po odpowiedzi → p06" p06

echo "## L. szerokości 1440, 360, 320 i motywy: brak poziomego przewijania, zrzuty" >> $LOG
$AB open "$URL?fast" >/dev/null 2>&1; sleep 1; $AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1; sel sc-draw "Ty czarne"
for W in 1440 360 320; do
  vp $W 900
  for TH in dark light; do
    theme $TH
    reset; stage "p05.1"; noscroll "L.$W.$TH.p05.1" "p05.1 przy $W px, motyw $TH"; shot "p05-1-$W-$TH"
    cell 8 H; opp; cell 9 I; opp; sleep 0.2
    sbtn sc-clock-50; noscroll "L.$W.$TH.p05.3" "p05.3 (mało czasu) przy $W px, motyw $TH"; shot "p05-3-malo-czasu-$W-$TH"
    stage "p05.2"; noscroll "L.$W.$TH.p05.2" "p05.2 przy $W px, motyw $TH"
    stage "p05.11"; noscroll "L.$W.$TH.p05.11" "p05.11 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p05-11-$W-$TH"
    sel sc-input "Dotyk"; cell 8 H; noscroll "L.$W.$TH.p05.4" "p05.4 (dotyk) przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p05-4-dotyk-$W-$TH"; sel sc-input "Mysz"
    stage "p05.1"; sbtn sc-bg-45; sleep 1.2; noscroll "L.$W.$TH.p05.10" "p05.10 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p05-10-wrociles-$W-$TH"
    sel sc-move "Błąd sieci"; cell 8 H; noscroll "L.$W.$TH.p05.7" "p05.7 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p05-7-blad-$W-$TH"; sel sc-move "Przyjęty"
    cb "Poddaj partię"; sleep 0.3; noscroll "L.$W.$TH.p05.13" "p05.13 (dialog poddania) przy $W px, motyw $TH"; shot "dialog-poddania-$W-$TH"; db "Wróć do gry"
    stage "p06.1"; noscroll "L.$W.$TH.p06.1" "p06.1 przy $W px, motyw $TH"; shot "p06-1-wygrana-$W-$TH"
    stage "p05.1"; sbtn sc-clock-0; noscroll "L.$W.$TH.p06.3" "p06.3 przy $W px, motyw $TH"; shot "p06-3-przegrana-na-czas-$W-$TH"
    stage "p06.2"; noscroll "L.$W.$TH.p06.2" "p06.2 przy $W px, motyw $TH"
    cb "Rewanż"; noscroll "L.$W.$TH.p06.11" "p06.11 przy $W px, motyw $TH"; shot "p06-11-rewanz-zaproponowany-$W-$TH"
    sbtn sc-rm-decline; noscroll "L.$W.$TH.p06.13" "p06.13 przy $W px, motyw $TH"; shot "p06-13-rewanz-odrzucony-$W-$TH"
    sbtn sc-rm-propose; noscroll "L.$W.$TH.p06.12" "p06.12 przy $W px, motyw $TH"; shot "p06-12-rewanz-oferta-$W-$TH"
    tog sc-rm-conflict; cb "Przyjmij"; sleep 0.3; noscroll "L.$W.$TH.p06.12-409" "p06.12 z 409 przy $W px, motyw $TH"; tog sc-rm-conflict
    sbtn sc-plus-5; noscroll "L.$W.$TH.p06.14" "p06.14 przy $W px, motyw $TH"
    stage "p06.4"; noscroll "L.$W.$TH.p06.4" "p06.4 (remis) przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p06-4-remis-$W-$TH"
    stage "p05.11"; sbtn sc-show-loss; noscroll "L.$W.$TH.p06.6" "p06.6 (gość) przy $W px, motyw $TH"
    sbtn sc-plus-1h; noscroll "L.$W.$TH.p06.7" "p06.7 przy $W px, motyw $TH"
    reset; stage "p05.1"; tog sc-dbdown; noscroll "L.$W.$TH.p07.4" "p07.4 przy $W px, motyw $TH"; shot "p07-4-baza-$W-$TH"; tog sc-dbdown
    acct T7; noscroll "L.$W.$TH.p07.2" "p07.2 przy $W px, motyw $TH"; shot "p07-2-404-$W-$TH"
  done
done
vp 1280 900; theme dark
echo DONE >> $LOG
