cd /home/bartek/Development/ai_techleaders_gomoku
AB="node_modules/.bin/agent-browser --session etap3"
LOG=${LOG:-$PWD/prototypes/konta-i-role/checks/etap3-log.txt}; : > $LOG
URL="http://localhost:8765/prototypes/konta-i-role/index.html"
t() { $AB eval "(document.querySelector('.screen.is-current .frame')||document.body).innerText" 2>/dev/null | tr '\n' ' ' | sed 's/^"//;s/"$//'; }
ck() { local g; g=$(t); if [[ "$g" == *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | oczekiwano: $3 | jest: ${g:0:220}" >> $LOG; fi; }
nk() { local g; g=$(t); if [[ "$g" != *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | nie powinno być: $3" >> $LOG; fi; }
sc() { $AB eval "document.querySelector('.screen.is-current').id" 2>/dev/null | tr -d '"'; }
at() { local g; g=$(sc); [[ "$g" == "$3" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | ekran: $g, oczekiwano $3" >> $LOG; }
fill() { $AB fill "$1" "$2" >/dev/null 2>&1; }
btn() { $AB find role button click --name "$1" >/dev/null 2>&1; sleep 0.5; }
lnk() { $AB find role link click --name "$1" >/dev/null 2>&1; sleep 0.5; }
tog() { $AB eval "document.getElementById('$1').click()" >/dev/null 2>&1; sleep 0.25; }
sel() { $AB eval "(()=>{const el=document.getElementById('$1');const o=[...el.options].find(o=>o.text.startsWith('$2'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,o.value);el.dispatchEvent(new Event('change',{bubbles:true}));})()" >/dev/null 2>&1; sleep 0.3; }
sbtn() { $AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent.includes('$1')).click()" >/dev/null 2>&1; sleep 0.4; }
bex() { $AB find role button click --name "$1" --exact >/dev/null 2>&1; sleep 0.5; }
acct() { sel sc-account "$1"; }
go() { $AB eval "document.dispatchEvent(new CustomEvent('prototype:navigate',{detail:'$1'}))" >/dev/null 2>&1; sleep 0.4; }
reset() { sbtn "Reset symulacji"; sleep 0.4; }
reg() { fill "#reg-email" "$1"; fill "#reg-name" "$2"; fill "#reg-password" "${3:-drewniana-plansza-2026}"; $AB eval "document.querySelector('[data-testid=register-form] button[type=submit]').click()" >/dev/null 2>&1; sleep 0.6; }
log() { fill "#login-email" "$1"; fill "#login-password" "${2-drewniana-plansza-2026}"; $AB eval "document.querySelector('[data-testid=login-form] button[type=submit]').click()" >/dev/null 2>&1; sleep 0.6; }
EV=$PWD/prototypes/konta-i-role/checks/etap3-evidence; mkdir -p $EV
shot() { $AB screenshot "$EV/$1.png" >/dev/null 2>&1; }
vp() { $AB set viewport "$1" "${2:-800}" >/dev/null 2>&1; sleep 0.3; }
theme() { # dark|light
  $AB eval "(()=>{const want='$1';if(document.documentElement.dataset.theme!==want)document.getElementById('theme-toggle').click();return document.documentElement.dataset.theme})()" >/dev/null 2>&1; sleep 0.3; }
noscroll() { local W; W=$($AB eval "document.documentElement.scrollWidth <= window.innerWidth" 2>/dev/null | tail -1); [[ "$W" == "true" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | poziome przewijanie" >> $LOG; }
ev() { $AB eval "$1" 2>/dev/null | tail -1; }
dialog() { ev "document.querySelector('[role=dialog],[role=alertdialog]')?.innerText.replace(/\\n+/g,' ')||'brak'"; }

$AB open "$URL?fast" >/dev/null 2>&1; sleep 1; $AB click summary >/dev/null 2>&1; sleep 0.3
$AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1

echo "## A. szerokości i motywy: brak poziomego przewijania na każdym ekranie" >> $LOG
for W in 1440 320; do
  vp $W
  for TH in dark light; do
    theme $TH
    sbtn "Reset symulacji"; sleep 0.3
    for S in s01 s02; do go $S; noscroll "A.$W.$TH.$S" "$S przy $W px, motyw $TH"; done
    sel sc-account "A2 Kuba"; sleep 0.3
    for S in s04 s05 s06 s07; do go $S; noscroll "A.$W.$TH.$S" "$S przy $W px, motyw $TH"; done
    btn "Potwierdź adres e-mail"; noscroll "A.$W.$TH.s03" "s03 przy $W px, motyw $TH"
    [[ "$TH" == dark || "$W" == 320 ]] && shot "s03-$W-$TH"
    go s04; shot "s04-$W-$TH"; go s01; shot "s01-$W-$TH"
  done
done
vp 1440; theme dark

echo "## A2. kontrolka szerokości podglądu (P13)" >> $LOG
sbtn "Reset symulacji"; go s01
sel sc-width "320 px"; Wd=$(ev "Math.round(document.querySelector('.screen.is-current .frame').getBoundingClientRect().width)"); [[ "$Wd" -le 320 ]] && echo "PASS A2.1 | podgląd 320 px: ramka $Wd px" >> $LOG || echo "FAIL A2.1 | ramka $Wd px" >> $LOG
sel sc-width "Pełna"; sleep 0.2

echo "## B. klawiatura" >> $LOG
sbtn "Reset symulacji"; go s01
$AB eval "document.getElementById('reg-email').focus()" >/dev/null 2>&1
ORDER=""; for i in 1 2 3 4 5 6; do $AB press Tab >/dev/null 2>&1; ORDER="$ORDER $(ev "document.activeElement.id||document.activeElement.getAttribute('aria-label')||document.activeElement.textContent.trim()")"; done
echo "INFO B.1 | Tab od pola e-mail:$ORDER" >> $LOG
[[ "$ORDER" == *'"reg-name"'*'"reg-password"'*'Pokaż hasło'*'Załóż konto'* ]] && echo "PASS B.1 | kolejność Tab: nazwa, hasło, Pokaż hasło, Załóż konto" >> $LOG || echo "FAIL B.1 | $ORDER" >> $LOG
O=$(ev "(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle+' '+s.outlineWidth})()"); echo "INFO B.2 | obrys fokusu na przycisku: $O" >> $LOG
[[ "$O" != *"none"* && "$O" != *" 0px"* ]] && echo "PASS B.2 | fokus na przycisku jest widoczny (obrys)" >> $LOG || echo "FAIL B.2 | $O" >> $LOG
fill "#reg-email" "kuba@example.com"; fill "#reg-name" "Kuba_P"; $AB eval "document.getElementById('reg-password').focus()" >/dev/null 2>&1; $AB keyboard type "drewniana-plansza-2026" >/dev/null 2>&1; $AB press Enter >/dev/null 2>&1; sleep 0.8
at B.3 "Enter w polu hasła wysyła rejestrację" s04
F=$(ev "document.activeElement.tagName+':'+document.activeElement.textContent.slice(0,20)"); echo "INFO B.4 | fokus po przejściu: $F" >> $LOG; [[ "$F" == *"H1"* ]] && echo "PASS B.4 | fokus na nagłówku nowego ekranu" >> $LOG || echo "FAIL B.4 | $F" >> $LOG
sbtn "Reset symulacji"; sel sc-account "A1 Ala"; go s04
$AB eval "[...document.querySelectorAll('.screen.is-current button')].find(b=>b.textContent==='Utwórz zaproszenie').focus()" >/dev/null 2>&1; $AB press Enter >/dev/null 2>&1; sleep 0.5
D=$(dialog); [[ "$D" == *"Poza tym prototypem"* ]] && echo "PASS B.5 | Enter na przycisku otwiera dialog" >> $LOG || echo "FAIL B.5 | $D" >> $LOG
$AB press Escape >/dev/null 2>&1; sleep 0.4; D=$(dialog); [[ "$D" == *brak* ]] && echo "PASS B.6 | Escape zamyka dialog" >> $LOG || echo "FAIL B.6 | $D" >> $LOG
sbtn "Reset symulacji"; sel sc-account "A3 Marek"; go s05
$AB eval "[...document.querySelectorAll('.screen.is-current button')].find(b=>b.textContent==='Wyloguj').focus()" >/dev/null 2>&1; $AB press Enter >/dev/null 2>&1; sleep 0.5
D=$(dialog); [[ "$D" == *"Trwa partia"* ]] && echo "PASS B.7 | dialog potwierdzenia z klawiatury" >> $LOG || echo "FAIL B.7 | $D" >> $LOG
A=$(ev "document.activeElement.textContent"); echo "INFO B.8 | fokus startuje na: $A" >> $LOG; [[ "$A" == *"Zostań zalogowany"* ]] && echo "PASS B.8 | fokus w dialogu zaczyna na drodze wyjścia" >> $LOG || echo "FAIL B.8 | $A" >> $LOG
$AB press Escape >/dev/null 2>&1; sleep 0.3

echo "## C. kliknięcia bez skutku: każdy przycisk i link z uwagi na ekrany" >> $LOG
sbtn "Reset symulacji"; go s04
lnk "Zaloguj się"; at C.1 "link „Zaloguj się” w nagłówku (s04) → s02" s02
$AB find role link click --name "Załóż konto" >/dev/null 2>&1; sleep 0.4; at C.2 "link „Załóż konto” (s02) → s01" s01
$AB find role link click --name "Zaloguj się" --exact >/dev/null 2>&1; sleep 0.4; at C.3 "nagłówek s01 „Zaloguj się” → s02" s02
$AB eval "[...document.querySelectorAll('.screen.is-current .frame header button, .screen.is-current .frame header a')].find(e=>e.textContent==='Zaloguj się').click()" >/dev/null 2>&1; sleep 0.5; ck C.4 "przycisk w nagłówku s02 waliduje (jak formularz)" "Podaj poprawny adres e-mail."
$AB eval "[...document.querySelectorAll('.screen.is-current a')].find(e=>e.textContent==='Nie pamiętasz hasła?').click()" >/dev/null 2>&1; sleep 0.4; D=$(dialog); [[ "$D" == *"Reset hasła"* ]] && echo "PASS C.5 | „Nie pamiętasz hasła?” → dialog Poza prototypem" >> $LOG || echo "FAIL C.5 | $D" >> $LOG; $AB press Escape >/dev/null 2>&1; sleep 0.3
sel sc-account "A1 Ala"; go s04
$AB eval "[...document.querySelectorAll('.screen.is-current button')].find(e=>e.textContent==='Szukam przeciwnika').click()" >/dev/null 2>&1; sleep 0.4; D=$(dialog); [[ "$D" == *"Szukam przeciwnika"* ]] && echo "PASS C.6 | „Szukam przeciwnika” → dialog" >> $LOG || echo "FAIL C.6 | $D" >> $LOG; $AB press Escape >/dev/null 2>&1; sleep 0.3
$AB eval "[...document.querySelectorAll('.screen.is-current a')].find(e=>e.textContent==='Co to znaczy?').click()" >/dev/null 2>&1; sleep 0.4; D=$(dialog); [[ "$D" == *"Lobby"* ]] && echo "PASS C.7 | „Co to znaczy?” → dialog" >> $LOG || echo "FAIL C.7 | $D" >> $LOG; $AB press Escape >/dev/null 2>&1; sleep 0.3
for NAME in Lobby Historia; do $AB eval "[...document.querySelectorAll('.screen.is-current header a')].find(e=>e.textContent==='$NAME').click()" >/dev/null 2>&1; sleep 0.4; D=$(dialog); [[ "$D" == *"$NAME"* || "$D" == *"Historia partii"* ]] && echo "PASS C.8$NAME | nagłówek „$NAME” → dialog" >> $LOG || echo "FAIL C.8$NAME | $D" >> $LOG; $AB press Escape >/dev/null 2>&1; sleep 0.3; done
$AB eval "[...document.querySelectorAll('.screen.is-current header a')].find(e=>e.textContent==='Konto').click()" >/dev/null 2>&1; sleep 0.4; at C.9 "nagłówek „Konto” → s05" s05
$AB eval "[...document.querySelectorAll('.screen.is-current header a')].find(e=>e.textContent==='Gomoku').click()" >/dev/null 2>&1; sleep 0.4; at C.10 "logo „Gomoku” → s04" s04
sbtn "Reset symulacji"; go s01; $AB eval "document.querySelector('.screen.is-current [aria-label=\"Pokaż hasło\"]').click()" >/dev/null 2>&1; T=$(ev "document.getElementById('reg-password').type"); [[ "$T" == '"text"' ]] && echo "PASS C.11 | Pokaż hasło odsłania pole" >> $LOG || echo "FAIL C.11 | $T" >> $LOG
tog sc-server; sel sc-account "A1 Ala"; go s05; bex "Wyloguj"; sleep 0.5; ck C.12 "komunikat po błędzie wylogowania" "nie potwierdził"; $AB eval "[...document.querySelectorAll('.screen.is-current button')].find(e=>e.textContent==='Zamknij').click()" >/dev/null 2>&1; sleep 0.3; nk C.13 "„Zamknij” chowa komunikat" "nie potwierdził"; tog sc-server

echo "## D. kontrolki scenariuszy bez wcześniejszych sprawdzeń" >> $LOG
sbtn "Reset symulacji"; T0=$(ev "document.querySelector('.doc-toolbar').innerText.match(/Teraz: [^.]*\\./)?.[0]"); sbtn "+1 h"; T1=$(ev "document.querySelector('.doc-toolbar').innerText.match(/Teraz: [^.]*\\./)?.[0]"); [[ "$T0" != "$T1" ]] && echo "PASS D.1 | +1 h zmienia zegar ($T0 → $T1)" >> $LOG || echo "FAIL D.1 | $T0 $T1" >> $LOG
sbtn "Wróć do 10:00"; T2=$(ev "document.querySelector('.doc-toolbar').innerText.match(/Teraz: [^.]*\\./)?.[0]"); [[ "$T2" == "$T0" ]] && echo "PASS D.2 | „Wróć do 10:00” przywraca zegar" >> $LOG || echo "FAIL D.2 | $T2" >> $LOG
sel sc-account "A1 Ala"; sbtn "Wygaś sesję"; go s04; ck D.3 "wygaszenie sesji: widok niezalogowany" "Załóż konto"
sel sc-account "A1 Ala"; sbtn "Wyloguj w innej karcie"; go s04; ck D.4 "wylogowanie w innej karcie" "Załóż konto"
sbtn "Reset symulacji"; sel sc-account "A1 Ala"; go s04; tog sc-loading; ck D.5 "ładowanie" "Ładowanie strony głównej"; tog sc-loading
for MODE in "Comment" "Clickable"; do $AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='$MODE').click()" >/dev/null 2>&1; sleep 0.2; done
C=$(ev "document.body.className"); [[ "$C" == *proto-click* ]] && echo "PASS D.6 | tryb Clickable/Comment przełącza się" >> $LOG || echo "FAIL D.6 | $C" >> $LOG
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Show hotspots').click()" >/dev/null 2>&1; C=$(ev "document.body.className"); [[ "$C" == *proto-hints* ]] && echo "PASS D.7 | Show hotspots" >> $LOG || echo "FAIL D.7 | $C" >> $LOG
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Hide hotspots').click()" >/dev/null 2>&1
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Presentation').click()" >/dev/null 2>&1; C=$(ev "document.body.className"); [[ "$C" != *proto-focus* ]] && echo "PASS D.8 | Presentation wyłącza tryb jednego ekranu" >> $LOG || echo "FAIL D.8 | $C" >> $LOG
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Presentation').click()" >/dev/null 2>&1
$AB eval "document.querySelector('.anno-panel').classList.contains('open')&&[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Threads').click()" >/dev/null 2>&1
$AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent==='Threads').click()" >/dev/null 2>&1; sleep 0.3; P=$(ev "document.querySelector('.anno-panel').className"); [[ "$P" == *open* ]] && echo "PASS D.9 | Threads otwiera panel" >> $LOG || echo "FAIL D.9 | $P" >> $LOG
echo DONE >> $LOG
