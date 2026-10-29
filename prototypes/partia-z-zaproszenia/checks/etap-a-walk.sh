#!/usr/bin/env bash
# Sprawdzenia etapu A w przeglądarce (agent-browser). Wymaga serwera HTTP w packages/ui/.storybook/public na porcie 8766:
#   cd packages/ui/.storybook/public && python3 -m http.server 8766
# i zbudowanego prototypu: npx vite build --config prototypes/partia-z-zaproszenia/vite.config.ts
# Wynik: checks/etap-a-log.txt (PASS/FAIL na linię), zrzuty: checks/etap-a-evidence/.
cd "$(git rev-parse --show-toplevel)"
AB="node_modules/.bin/agent-browser --session etapa"
P=prototypes/partia-z-zaproszenia
LOG=${LOG:-$PWD/$P/checks/etap-a-log.txt}; : > $LOG
URL="http://localhost:8766/prototypes/partia-z-zaproszenia/index.html"
EV=$PWD/$P/checks/etap-a-evidence; mkdir -p $EV
ev() { $AB eval "$1" 2>/dev/null | tail -1 | sed 's/^"//;s/"$//'; }
t() { $AB eval "(document.querySelector('.screen.is-current .frame')||document.body).innerText" 2>/dev/null | sed 's/\\n/ /g;s/^"//;s/"$//' | tr -s ' '; }
ck() { local g; g=$(t); if [[ "$g" == *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | oczekiwano: $3 | jest: ${g:0:200}" >> $LOG; fi; }
nk() { local g; g=$(t); if [[ "$g" != *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | nie powinno być: $3" >> $LOG; fi; }
sc() { ev "document.querySelector('.screen.is-current').id"; }
at() { local g; g=$(sc); [[ "$g" == "$3" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | ekran: $g, oczekiwano $3" >> $LOG; }
# state id of the current screen, as the review bar shows it
st() { ev "document.querySelector('.screen.is-current [data-state]')?.getAttribute('data-state')||'brak'"; }
sk() { local g; g=$(st); [[ "$g" == "$3" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | stan: $g, oczekiwano $3" >> $LOG; }
fill() { $AB fill "$1" "$2" >/dev/null 2>&1; }
# click a button or link in the current screen by its exact text
cb() { $AB eval "(()=>{const e=[...document.querySelectorAll('.screen.is-current .frame button, .screen.is-current .frame a')].find(e=>e.textContent.trim()==='$1');if(!e)return 'brak';e.click();return 'ok'})()" >/dev/null 2>&1; sleep 0.45; }
# click a button in a dialog (rendered outside the screen)
db() { $AB eval "(()=>{const e=[...document.querySelectorAll('[role=dialog] button,[role=alertdialog] button')].find(e=>e.textContent.trim()==='$1');if(!e)return 'brak';e.click();return 'ok'})()" >/dev/null 2>&1; sleep 0.45; }
tog() { $AB eval "document.getElementById('$1').click()" >/dev/null 2>&1; sleep 0.25; }
sel() { $AB eval "(()=>{const el=document.getElementById('$1');const o=[...el.options].find(o=>o.text.startsWith('$2'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,o.value);el.dispatchEvent(new Event('change',{bubbles:true}));})()" >/dev/null 2>&1; sleep 0.4; }
sbtn() { $AB eval "document.getElementById('$1').click()" >/dev/null 2>&1; sleep 0.45; }
acct() { sel sc-account "$1"; }
stage() { sel sc-stage "$1"; }
go() { $AB eval "document.dispatchEvent(new CustomEvent('prototype:navigate',{detail:'$1'}))" >/dev/null 2>&1; sleep 0.4; }
reset() { $AB eval "[...document.querySelectorAll('.scenario-bar button')].find(b=>b.textContent==='Reset symulacji').click()" >/dev/null 2>&1; sleep 0.4; }
dialog() { ev "document.querySelector('[role=dialog],[role=alertdialog]')?.innerText.replace(/\\n+/g,' ')||'brak'"; }
shot() { $AB screenshot "$EV/$1.png" >/dev/null 2>&1; }
vp() { $AB set viewport "$1" "${2:-800}" >/dev/null 2>&1; sleep 0.3; }
theme() { $AB eval "(()=>{const want='$1';if(document.documentElement.dataset.theme!==want)document.getElementById('theme-toggle').click();return document.documentElement.dataset.theme})()" >/dev/null 2>&1; sleep 0.3; }
noscroll() { local W; W=$(ev "document.documentElement.scrollWidth <= window.innerWidth"); [[ "$W" == "true" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | poziome przewijanie" >> $LOG; }
create() { cb "Utwórz zaproszenie"; }

$AB open "$URL?fast" >/dev/null 2>&1; sleep 1; vp 1280 900
$AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1

echo "## A. p01: utworzenie partii" >> $LOG
at A.1 "start na p01" p01; sk A.2 "p01.1 przycisk" p01.1
ck A.3 "Utwórz zaproszenie i Masz kod? na stronie głównej" "Utwórz zaproszenie Masz kod?"
create; at A.4 "T1 tworzy partię → p03" p03; sk A.5 "p03.1" p03.1
ck A.6 "kod ABCD-EFGH, link i Ważne do" "ABCD-EFGH"; ck A.7 "link" "https://gomoku.example/invite/ABCD-EFGH"; ck A.8 "Ważne do wtorek" "Ważne do wtorek"
cb "Wróć do panelu głównego" ; go p01; ck A.9 "Masz partię z linkiem „Wróć do partii”" "Masz partię"
cb "Wróć do partii"; at A.10 "„Wróć do partii” → p03" p03
go p01; create; at A.11 "druga próba utworzenia: oczekująca partia → p03" p03; sk A.12 "p03.1 + p01.4" "p03.1 + p01.4"; ck A.13 "komunikat L01" "Masz już oczekującą partię."
reset; acct T3; go p01; create; sk A.14 "T3 (partia w toku) → p01.3" p01.3; ck A.15 "Masz już partię" "Masz już partię"
cb "Przejdź do partii"; D=$(dialog); [[ "$D" == *"Poza tym prototypem"* ]] && echo "PASS A.16 | link do partii w toku → Poza tym prototypem" >> $LOG || echo "FAIL A.16 | $D" >> $LOG; db "Wróć do prototypu"
acct T4; go p01; create; at A.17 "T4 (własna oczekująca) → p03" p03; ck A.18 "kod partii Ewy" "KMNP-QRST"
reset; acct T2; ck A.19 "T2: baner potwierdzenia e-maila nie blokuje" "Potwierdź adres e-mail"; create; at A.20 "T2 niepotwierdzony tworzy partię (BR-26)" p03
reset; acct T6; ck A.21 "T6: bez przycisku Utwórz zaproszenie" "Załóż konto"; nk A.22 "T6 nie tworzy" "Utwórz zaproszenie" "Utwórz zaproszenie"
cb "Załóż konto"; D=$(dialog); [[ "$D" == *"prototypu kont"* ]] && echo "PASS A.23 | Załóż konto → dialog Poza tym prototypem (konta)" >> $LOG || echo "FAIL A.23 | $D" >> $LOG; db "Wróć do prototypu"
acct T1; sel sc-create "Limit"; create; sk A.24 "wymuszony limit → p01.5" p01.5; ck A.25 "tekst limitu" "Zbyt wiele zaproszeń"
sel sc-create "Błąd serwera"; create; sk A.26 "wymuszony błąd serwera → p01.6" p01.6; cb "Spróbuj ponownie"; sk A.27 "ponowienie nadal p01.6" p01.6
sel sc-create "Brak sieci"; create; sk A.28 "brak sieci → p01.7" p01.7; ck A.29 "treść" "Nie udało się połączyć z serwerem"
sel sc-create "Masz już partię"; create; sk A.30 "wymuszone p01.3" p01.3
sel sc-create "Według"; reset

echo "## B. p02: kod zaproszenia" >> $LOG
go p01; cb "Masz kod?"; at B.1 "Masz kod? → p02" p02; sk B.2 "p02.1" p02.1
fill "#join-code" "ABC"; cb "Dalej"; sk B.3 "za krótki kod → p02.2" p02.2; ck B.4 "komunikat" "Sprawdź kod: ma 8 znaków."
tog sc-limit; fill "#join-code" "ABCD-EFGH"; cb "Dalej"; sk B.5 "limit → p02.3" p02.3; ck B.6 "komunikat" "Zbyt wiele prób"; tog sc-limit
stage "p03: Ala"; go p02; acct T2; fill "#join-code" "abcdefgh"; cb "Dalej"; at B.7 "kod z małych liter bez myślnika → s07" s07; sk B.8 "s07.3" s07.3
go p02; fill "#join-code" "QQQQ-QQQQ"; cb "Dalej"; at B.9 "nieistniejący kod → s07" s07; sk B.10 "s07.9" s07.9
reset; go p02; for i in 1 2 3 4 5 6; do go p02; fill "#join-code" "ZZZZ-ZZZ$i"; cb "Dalej"; done; sk B.11 "6. nieudane sprawdzenie → s07.8" s07.8

echo "## C. s07: zaproszenie" >> $LOG
reset; stage "p03: Ala"; acct T6; sbtn sc-open-invite; at C.1 "T6 otwiera zaproszenie" s07; sk C.2 "s07.1" s07.1
ck C.3 "trzy wybory" "Zaloguj się Załóż konto Graj jako gość"; ck C.4 "zaprasza" "Ala_7 zaprasza Cię do partii Gomoku"
cb "Graj jako gość"; sk C.5 "s07.2" s07.2; ck C.6 "ostrzeżenie dla gościa" "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii"
cb "Wróć"; sk C.7 "Wróć → s07.1" s07.1
cb "Zaloguj się"; D=$(dialog); [[ "$D" == *"prototypu kont"* ]] && echo "PASS C.8 | Zaloguj się → dialog" >> $LOG || echo "FAIL C.8 | $D" >> $LOG; db "Wróć do prototypu"
cb "Graj jako gość"; cb "Rozumiem, graj jako gość"; at C.9 "gość dołączył → p04" p04; sk C.10 "p04.1 + p04.4" "p04.1 + p04.4"
ck C.11 "czekamy, aż Ala_7 otworzy" "Czekamy, aż Ala_7 otworzy partię"; ck C.12 "ostrzeżenie gościa stałe" "Grasz bez konta"
B=$(ev "document.querySelector('.doc-toolbar').innerText"); [[ "$B" == *"Sesja: gość w partii"* ]] && echo "PASS C.13 | pasek: sesja gościa" >> $LOG || echo "FAIL C.13 | $B" >> $LOG
acct T1; ck C.14 "twórca widzi Przeciwnik dołączył (p03.5)" "Gość dołączył do partii"; sk C.15 "p03.5" p03.5
cb "Przejdź do partii"; at C.16 "→ p04" p04; sk C.17 "p04.2" p04.2
reset; stage "p03: Ala"; acct T2; sbtn sc-open-invite; sk C.18 "T2 zalogowany: s07.3" s07.3; nk C.19 "zalogowany bez opcji gościa" "Graj jako gość" "Graj jako gość"
cb "Dołącz do partii"; at C.20 "T2 dołączył → p04" p04; sk C.21 "p04.1" p04.1
sbtn sc-open-invite; at C.22 "uczestnik ponownie na linku (s07.4) → partia" p04
acct T1; sbtn sc-open-invite; at C.23 "twórca na własnym linku (s07.5) → partia (p03.5, jeszcze nie widział dołączenia)" p03
reset; stage "p03: Ala"; acct T3; sbtn sc-open-invite; sk C.24 "T3 (partia w toku): s07.6" s07.6; ck C.25 "Masz już partię" "Masz już partię"
acct T4; sk C.26 "T4 (własna oczekująca): s07.7" s07.7; ck C.27 "przycisk Q18" "Anuluj moją partię i dołącz"
cb "Anuluj moją partię i dołącz"; at C.28 "anulowanie własnej i dołączenie → p04" p04
acct T4; go p01; ck C.29 "partia Ewy anulowana, jest nowa" "Masz partię"
reset; stage "p03: Ala"; acct T7; sbtn sc-open-invite; sk C.30 "T7 widzi s07.3" s07.3
acct T1; $AB eval "document.getElementById('sc-join-account').click()" >/dev/null 2>&1; sleep 0.4; acct T7; sbtn sc-open-invite; sk C.31 "po dołączeniu przeciwnika link jest nieważny dla trzeciej osoby (BR-11)" s07.9
reset; sel sc-invite "Limit"; go s07; sk C.32 "kontrolka: s07.8" s07.8; sel sc-invite "Nieważne"; sk C.33 "kontrolka: s07.9" s07.9; sel sc-invite "Według"
sel sc-invite "Nieważne"; go s07; ck C.34 "Masz kod? / Wróć na stronę główną w s07.9" "Wróć na stronę główną"

echo "## D. p03: oczekiwanie" >> $LOG
reset; stage "p03: Ala"; at D.1 "skrót p03" p03
cb "Kopiuj"; sk D.2 "Kopiuj → p03.2" p03.2; ck D.3 "komunikat" "Skopiowano link do schowka."; ck D.4 "przycisk Skopiowano" "Skopiowano"
tog sc-noclip; cb "Skopiowano"; sk D.5 "schowek niedostępny → p03.3" p03.3; ck D.6 "zaznaczone ręcznie" "Link jest zaznaczony"
SEL=$(ev "window.getSelection().toString()"); [[ "$SEL" == *"https://gomoku.example/invite/ABCD-EFGH"* ]] && echo "PASS D.7 | link zaznaczony w stronie" >> $LOG || echo "FAIL D.7 | zaznaczenie: $SEL" >> $LOG
tog sc-noclip; cb "Udostępnij"; ck D.8 "Udostępnij → komunikat o telefonie" "dostępne tylko na telefonie"
tog sc-noshare; nk D.9 "Udostępnij ukryty (p03.4)" "Udostępnij" "Udostępnij"; tog sc-noshare
cb "Anuluj zaproszenie"; sk D.10 "dialog → p03.6" p03.6; D=$(dialog); [[ "$D" == *"Anulować zaproszenie?"* && "$D" == *"Tej operacji nie można cofnąć"* ]] && echo "PASS D.11 | treść dialogu anulowania" >> $LOG || echo "FAIL D.11 | $D" >> $LOG
A=$(ev "document.activeElement.textContent"); [[ "$A" == *"Wróć"* ]] && echo "PASS D.12 | fokus w dialogu zaczyna na drodze wyjścia („Wróć”)" >> $LOG || echo "FAIL D.12 | fokus: $A" >> $LOG
$AB press Escape >/dev/null 2>&1; sleep 0.4; D=$(dialog); [[ "$D" == *brak* ]] && echo "PASS D.13 | Escape zamyka dialog" >> $LOG || echo "FAIL D.13 | $D" >> $LOG; sk D.14 "po Escape p03.1/p03.4" p03.1
cb "Anuluj zaproszenie"; db "Wróć"; sk D.15 "Wróć → p03.1" p03.1
tog sc-pollerr; sleep 3.6; sk D.16 "błąd odpytywania po 3 próbach → p03.10" p03.10; ck D.17 "baner" "Nie udało się sprawdzić, czy przeciwnik dołączył"
tog sc-pollerr; cb "Sprawdź teraz"; sleep 1.2; sk D.18 "po ustąpieniu błędu p03.1" p03.1
sbtn sc-join-account; sk D.19 "przeciwnik dołączył → p03.5" p03.5; ck D.20 "Przeciwnik dołączył" "Kuba_P dołączył do partii"
sleep 2.8; at D.21 "po 2,5 s automatycznie → p04" p04; sk D.22 "p04.2" p04.2
reset; stage "p03: Ala"; cb "Anuluj zaproszenie"; db "Tak, anuluj zaproszenie"; at D.23 "anulowanie → strona główna" p01; ck D.24 "komunikat o anulowaniu" "Zaproszenie zostało anulowane. Link jest już nieważny."
acct T2; sbtn sc-open-invite; sk D.25 "link po anulowaniu jest nieważny (s07.9)" s07.9
acct T1; go p03; sk D.26 "twórca nie ma już strony partii (p07.2)" p07.2
reset; stage "p03: Ala"; tog sc-join-cancel; cb "Anuluj zaproszenie"; db "Tak, anuluj zaproszenie"; sk D.27 "przeciwnik zdążył dołączyć → p03.5" p03.5; ck D.28 "komunikat" "Przeciwnik zdążył dołączyć"; tog sc-join-cancel
reset; stage "p03: Ala"; sbtn sc-plus-24; sk D.29 "+24 h → p03.9" p03.9; ck D.30 "treść" "Zaproszenie wygasło. Utwórz nowe."
create; sk D.31 "nowe zaproszenie po wygaśnięciu" p03.1; ck D.32 "inny kod" "JKMN-PQRS"
reset; stage "p03: Ala"; sbtn sc-plus-24; acct T2; sbtn sc-open-invite; sk D.33 "wygasłe zaproszenie dla znajomego: s07.9" s07.9
reset; stage "p03: Ala"; acct T7; go p03; sk D.34 "osoba spoza partii: p07.2" p07.2

echo "## E. p04: partia gotowa" >> $LOG
reset; stage "p04.1"; at E.1 "skrót p04.1 (widok Kuby)" p04; sk E.2 "p04.1" p04.1
ck E.3 "tekst oczekiwania" "Czekamy, aż Ala_7 otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)"
ck E.4 "zegary 10:00" "10:00"; nk E.5 "bez Przejdź do planszy przed otwarciem" "Przejdź do planszy" "Przejdź do planszy"
sbtn sc-opens; sk E.6 "twórca otwiera → p04.2" p04.2; ck E.7 "Partia gotowa" "Partia gotowa"
cb "Przejdź do planszy"; D=$(dialog); [[ "$D" == *"kolejnym etapie"* ]] && echo "PASS E.8 | Przejdź do planszy → dialog (etap B)" >> $LOG || echo "FAIL E.8 | $D" >> $LOG; db "Wróć do prototypu"
cb "Wróć do panelu głównego"; at E.9 "Wróć do panelu głównego → p01" p01
reset; stage "p04.1"; sbtn sc-plus-15; sk E.10 "+15 min bez otwarcia → p04.3 (widok Kuby)" p04.3; ck E.11 "zdanie gracza, który otworzył" "Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano."
acct T1; sk E.12 "p04.3 u twórcy" p04.3; ck E.13 "zdanie twórcy" "Partię anulowano: nie została otwarta w ciągu 15 minut."
cb "Wróć do panelu głównego"; at E.14 "→ p01" p01; nk E.15 "partia zwolniona (BR-13)" "Masz partię" "Masz partię"
create; at E.16 "po anulowaniu można utworzyć nową" p03
reset; stage "p04.4"; sk E.17 "gość: p04.1 + p04.4" "p04.1 + p04.4"; ck E.18 "ostrzeżenie dla gościa" "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii"
acct T6; go p04; sk E.19 "gość w innej przeglądarce (T6): p07.3" p07.3; ck E.20 "to samo 404 co p07.2" "Ta partia nie istnieje albo nie masz do niej dostępu"
reset; acct T3; go p04; ck E.21 "partia w toku (T3) wskazuje etap B" "Plansza jest w kolejnym etapie prototypu"
reset; stage "p04.2"; acct T1; sk E.22 "twórca po otwarciu: p04.2" p04.2

echo "## F. kontrolki i silnik" >> $LOG
reset; T0=$(ev "document.querySelector('.doc-toolbar').innerText.match(/Teraz: [^.]*\\./)?.[0]"); sbtn sc-plus-1h; T1=$(ev "document.querySelector('.doc-toolbar').innerText.match(/Teraz: [^.]*\\./)?.[0]"); [[ "$T0" != "$T1" ]] && echo "PASS F.1 | +1 h zmienia zegar" >> $LOG || echo "FAIL F.1 | $T0 $T1" >> $LOG
sbtn sc-back; T2=$(ev "document.querySelector('.doc-toolbar').innerText.match(/Teraz: [^.]*\\./)?.[0]"); [[ "$T2" == "$T0" ]] && echo "PASS F.2 | Wróć do 10:00" >> $LOG || echo "FAIL F.2 | $T2" >> $LOG
sel sc-width "320"; Wd=$(ev "Math.round(document.querySelector('.screen.is-current .frame').getBoundingClientRect().width)"); [[ "$Wd" -le 320 ]] && echo "PASS F.3 | podgląd 320 px: ramka $Wd px" >> $LOG || echo "FAIL F.3 | $Wd" >> $LOG; sel sc-width "Pełna"
for MODE in "Comment" "Clickable"; do $AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='$MODE').click()" >/dev/null 2>&1; sleep 0.2; done
C=$(ev "document.body.className"); [[ "$C" == *proto-click* ]] && echo "PASS F.4 | tryb Clickable/Comment przełącza się" >> $LOG || echo "FAIL F.4 | $C" >> $LOG
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Show hotspots').click()" >/dev/null 2>&1; C=$(ev "document.body.className"); [[ "$C" == *proto-hints* ]] && echo "PASS F.5 | Show hotspots" >> $LOG || echo "FAIL F.5 | $C" >> $LOG
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Hide hotspots').click()" >/dev/null 2>&1
for S in p02 s07 p03 p04 p01; do $AB eval "[...document.querySelectorAll('.screen-nav a')].find(a=>a.getAttribute('href')==='#$S').click()" >/dev/null 2>&1; sleep 0.3; N=$(sc); [[ "$N" == "$S" || ( "$S" == p03 && "$N" == p03 ) ]] && echo "PASS F.6$S | pasek ekranów → $S" >> $LOG || echo "FAIL F.6$S | ekran $N" >> $LOG; done
$AB eval "document.querySelectorAll('.screen-nav a').length" >/dev/null 2>&1

echo "## G. klawiatura" >> $LOG
reset; go p02; $AB eval "document.getElementById('join-code').focus()" >/dev/null 2>&1
$AB keyboard type "abcdefgh" >/dev/null 2>&1; $AB press Enter >/dev/null 2>&1; sleep 0.6; at G.1 "Enter w polu kodu wysyła (→ s07)" s07
F=$(ev "document.activeElement.tagName"); [[ "$F" == "H1" ]] && echo "PASS G.2 | fokus na nagłówku nowego ekranu" >> $LOG || echo "FAIL G.2 | $F" >> $LOG
stage "p03: Ala"; ORDER=""; $AB eval "(()=>{const h=document.querySelector('.screen.is-current h1');h.setAttribute('tabindex','-1');h.focus()})()" >/dev/null 2>&1
for i in 1 2 3 4; do $AB press Tab >/dev/null 2>&1; ORDER="$ORDER|$(ev "document.activeElement.textContent.trim()")"; done
echo "INFO G.3 | Tab od nagłówka p03:$ORDER" >> $LOG
[[ "$ORDER" == *"Kopiuj"*"Udostępnij"*"Anuluj zaproszenie"* ]] && echo "PASS G.4 | kolejność Tab: Kopiuj, Udostępnij, Anuluj" >> $LOG || echo "FAIL G.4 | $ORDER" >> $LOG
O=$(ev "(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle+' '+s.outlineWidth})()"); [[ "$O" != *"none"* && "$O" != *" 0px"* ]] && echo "PASS G.5 | fokus widoczny ($O)" >> $LOG || echo "FAIL G.5 | $O" >> $LOG
$AB press Enter >/dev/null 2>&1; sleep 0.5; D=$(dialog); [[ "$D" == *"Anulować zaproszenie?"* ]] && echo "PASS G.6 | Enter na Anuluj otwiera dialog" >> $LOG || echo "FAIL G.6 | $D" >> $LOG
$AB press Escape >/dev/null 2>&1; sleep 0.4
F=$(ev "document.activeElement.textContent.trim()"); [[ "$F" == *"Anuluj zaproszenie"* ]] && echo "PASS G.7 | po Escape fokus wraca na „Anuluj zaproszenie”" >> $LOG || echo "FAIL G.7 | $F" >> $LOG

echo "## H. szerokości i motywy: brak poziomego przewijania, zrzuty" >> $LOG
snap() { # name: screen state set up by the caller
  shot "$1-$W-$TH"; }
for W in 1440 360 320; do
  vp $W 900
  for TH in dark light; do
    theme $TH
    reset; acct T1; go p01; noscroll "H.$W.$TH.p01" "p01 przy $W px, motyw $TH"; snap p01
    create; go p01; sel sc-create "Limit"; create; noscroll "H.$W.$TH.p01.5" "p01.5 przy $W px, motyw $TH"; sel sc-create "Według"; reset
    go p02; fill "#join-code" "ABC"; cb "Dalej"; noscroll "H.$W.$TH.p02" "p02.2 przy $W px, motyw $TH"; snap p02
    stage "p03: Ala"; noscroll "H.$W.$TH.p03" "p03.1 przy $W px, motyw $TH"; snap p03
    cb "Kopiuj"; noscroll "H.$W.$TH.p03.2" "p03.2 przy $W px, motyw $TH"
    cb "Anuluj zaproszenie"; noscroll "H.$W.$TH.p03.6" "p03.6 (dialog) przy $W px, motyw $TH"; [[ "$W" == 360 || "$TH" == dark ]] && shot "p03.6-$W-$TH"; db "Wróć"
    sbtn sc-join-account; noscroll "H.$W.$TH.p03.5" "p03.5 przy $W px, motyw $TH"; sleep 2.8
    noscroll "H.$W.$TH.p04.2" "p04.2 przy $W px, motyw $TH"; snap p04
    stage "p04.1"; noscroll "H.$W.$TH.p04.1" "p04.1 przy $W px, motyw $TH"
    stage "p04.4"; noscroll "H.$W.$TH.p04.4" "p04.1 + p04.4 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p04.4-$W-$TH"
    sbtn sc-plus-15; noscroll "H.$W.$TH.p04.3" "p04.3 przy $W px, motyw $TH"
    reset; stage "p03: Ala"; sbtn sc-plus-24; noscroll "H.$W.$TH.p03.9" "p03.9 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "p03.9-$W-$TH"
    reset; stage "p03: Ala"; acct T6; sbtn sc-open-invite; noscroll "H.$W.$TH.s07" "s07.1 przy $W px, motyw $TH"; snap s07
    cb "Graj jako gość"; noscroll "H.$W.$TH.s07.2" "s07.2 przy $W px, motyw $TH"; [[ "$W" == 360 ]] && shot "s07.2-$W-$TH"
    acct T3; sbtn sc-open-invite; noscroll "H.$W.$TH.s07.6" "s07.6 przy $W px, motyw $TH"
    acct T4; noscroll "H.$W.$TH.s07.7" "s07.7 przy $W px, motyw $TH"
    acct T7; go p03; noscroll "H.$W.$TH.p07.2" "p07.2 przy $W px, motyw $TH"
  done
done
vp 1280 900; theme dark
echo DONE >> $LOG
