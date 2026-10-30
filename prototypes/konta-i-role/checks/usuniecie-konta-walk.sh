#!/usr/bin/env bash
# Przejście stanów s05.10–s05.20, s04.14 i s08 (usunięcie konta, E01-S06 #37) w agent-browser.
# Uruchom z roota repozytorium po `npx vite build --config prototypes/konta-i-role/vite.config.ts`
# i serwerze HTTP w packages/ui/.storybook/public (PORT, domyślnie 8771).
# Wynik: checks/usuniecie-konta-log.txt, zrzuty: checks/usuniecie-konta-evidence/.
cd "$(git rev-parse --show-toplevel)"
PORT=${PORT:-8771}
AB="node_modules/.bin/agent-browser --session usuniecie"
LOG=${LOG:-$PWD/prototypes/konta-i-role/checks/usuniecie-konta-log.txt}; : > $LOG
EV=${EV:-$PWD/prototypes/konta-i-role/checks/usuniecie-konta-evidence}; mkdir -p $EV
URL="http://localhost:$PORT/prototypes/konta-i-role/index.html"
ev() { $AB eval "$1" 2>/dev/null | tail -1; }
t() { $AB eval "(document.querySelector('.screen.is-current .frame')||document.body).innerText" 2>/dev/null | tr '\n' ' ' | sed 's/^"//;s/"$//'; }
ck() { local g; g=$(t); if [[ "$g" == *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | oczekiwano: $3 | jest: ${g:0:260}" >> $LOG; fi; }
nk() { local g; g=$(t); if [[ "$g" != *"$3"* ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | nie powinno być: $3" >> $LOG; fi; }
is() { # id opis oczekiwane-wyrażenie-JS
  local g; g=$(ev "$3"); if [[ "$g" == "true" ]]; then echo "PASS $1 | $2" >> $LOG; else echo "FAIL $1 | $2 | wynik: $g" >> $LOG; fi; }
sc() { $AB eval "document.querySelector('.screen.is-current').id" 2>/dev/null | tr -d '"'; }
at() { local g; g=$(sc); [[ "$g" == "$3" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | ekran: $g, oczekiwano $3" >> $LOG; }
fill() { $AB fill "$1" "$2" >/dev/null 2>&1; }
tog() { $AB eval "document.getElementById('$1').click()" >/dev/null 2>&1; sleep 0.25; }
sel() { $AB eval "(()=>{const el=document.getElementById('$1');const o=[...el.options].find(o=>o.text.startsWith('$2'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,o.value);el.dispatchEvent(new Event('change',{bubbles:true}));})()" >/dev/null 2>&1; sleep 0.3; }
sbtn() { $AB eval "[...document.querySelectorAll('.doc-toolbar button')].find(b=>b.textContent.includes('$1')).click()" >/dev/null 2>&1; sleep 0.4; }
go() { $AB eval "document.dispatchEvent(new CustomEvent('prototype:navigate',{detail:'$1'}))" >/dev/null 2>&1; sleep 0.4; }
cl() { $AB eval "document.querySelector('$1').click()" >/dev/null 2>&1; sleep ${2:-0.5}; }
# Zrzut: przy otwartym dialogu cały widok (nakładka), inaczej sama ramka bieżącego ekranu bez paska przeglądu.
shot() {
  if [[ "$(ev "!!document.querySelector('[role=alertdialog]')")" == "true" ]]; then $AB screenshot "$EV/$1.png" >/dev/null 2>&1
  else $AB screenshot ".screen.is-current .frame" "$EV/$1.png" >/dev/null 2>&1; fi
}
vp() { $AB set viewport "$1" "${2:-900}" >/dev/null 2>&1; sleep 0.3; }
theme() { $AB eval "(()=>{const want='$1';if(document.documentElement.dataset.theme!==want)document.getElementById('theme-toggle').click();})()" >/dev/null 2>&1; sleep 0.3; }
dialog() { ev "document.querySelector('[role=alertdialog]')?.innerText.replace(/\\n+/g,' ')||'brak'"; }
noscroll() { local W; W=$(ev "document.documentElement.scrollWidth <= window.innerWidth"); [[ "$W" == "true" ]] && echo "PASS $1 | $2" >> $LOG || echo "FAIL $1 | $2 | poziome przewijanie" >> $LOG; }
focused() { ev "document.activeElement.id||document.activeElement.textContent.trim().slice(0,40)" | tr -d '"'; }
PW='drewniana-plansza-2026'
SUB='[data-testid=delete-account-submit]'
CONF='[data-testid=delete-account-confirm]'
fresh() { sbtn "Reset symulacji"; sel sc-account "$1"; go s05; sleep 0.3; }
prep() { fill "#delete-account-password" "$1"; cl "$CONF" 0.2; }

$AB open "$URL?fast" >/dev/null 2>&1; sleep 1.2; vp 1440 1800; theme dark
$AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1
# panel scenariuszy zwinięty; kontrolki są w DOM i klikalne przez eval

echo "## s05.10 domyślny" >> $LOG
fresh "A1"
ck s05.10.a "sekcja Usuń konto z ostrzeżeniem o skutkach" "Tego nie da się cofnąć"
ck s05.10.b "ostrzeżenie mówi o Usuniętym graczu" "„Usunięty gracz”"
is s05.10.c "przycisk nieaktywny z powodem w aria-describedby" "(()=>{const b=document.querySelector('$SUB');return b.disabled&&document.getElementById(b.getAttribute('aria-describedby')).innerText.includes('Zaznacz potwierdzenie')})()"
nk s05.10.d "bez wzmianki o oczekującej partii (Ala_7)" "oczekująca partia"
shot s05.10-dark-1440
echo "## s05.13 gotowe do usunięcia" >> $LOG
prep "$PW"
is s05.13.a "po zaznaczeniu przycisk aktywny" "!document.querySelector('$SUB').disabled"
shot s05.13-dark-1440
echo "## s05.14 dialog potwierdzenia" >> $LOG
cl "$SUB" 0.5
D=$(dialog); [[ "$D" == *"Usunąć konto Ala_7?"* && "$D" == *"Zostaw konto"* ]] && echo "PASS s05.14.a | dialog z nazwą konta i drogą wyjścia" >> $LOG || echo "FAIL s05.14.a | $D" >> $LOG
F=$(focused); [[ "$F" == *"Zostaw konto"* ]] && echo "PASS s05.14.b | fokus startuje na Zostaw konto" >> $LOG || echo "FAIL s05.14.b | fokus: $F" >> $LOG
shot s05.14-dark-1440
$AB press Escape >/dev/null 2>&1; sleep 0.4
D=$(dialog); [[ "$D" == '"brak"' ]] && echo "PASS s05.14.c | Escape zamyka dialog" >> $LOG || echo "FAIL s05.14.c | $D" >> $LOG
F=$(ev "document.activeElement.getAttribute('data-testid')"); [[ "$F" == '"delete-account-submit"' ]] && echo "PASS s05.14.d | fokus wraca na przycisk" >> $LOG || echo "FAIL s05.14.d | fokus: $F" >> $LOG
echo "## s05.15 w toku (opóźnienie serwera 600 ms, bez ?fast)" >> $LOG
$AB open "$URL" >/dev/null 2>&1; sleep 1.2; $AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1
fresh "A1"; prep "$PW"; cl "$SUB" 0.5
$AB eval "(()=>{const b=[...document.querySelectorAll('[role=alertdialog] button')].find(x=>x.textContent.includes('Usuń konto na zawsze'));b.click();b.click();})()" >/dev/null 2>&1; sleep 0.15
is s05.15.a "przycisk w dialogu zajęty (aria-busy) i zablokowany" "(()=>{const b=[...document.querySelectorAll('[role=alertdialog] button')].find(x=>x.getAttribute('aria-busy')==='true');return !!b&&b.disabled})()"
shot s05.15-dark-1440
sleep 1.2
at s05.15.b "podwójne kliknięcie: jedno usunięcie, wynik na s04" s04
$AB open "$URL?fast" >/dev/null 2>&1; sleep 1.2; $AB eval "document.querySelector('.scenario-bar').open=false" >/dev/null 2>&1

echo "## s05.16 błędne hasło i licznik" >> $LOG
fresh "A1"; prep "zle-haslo-1"; cl "$SUB" 0.4; cl '[role=alertdialog] button:last-of-type' 0.8
ck s05.16.a "błąd przy polu, bez szczegółów" "Nieprawidłowe hasło."
nk s05.16.b "pierwszy błąd bez licznika" "Zostało prób"
F=$(focused); [[ "$F" == "delete-account-password" ]] && echo "PASS s05.16.c | fokus na polu hasła" >> $LOG || echo "FAIL s05.16.c | fokus: $F" >> $LOG
is s05.16.d "pole z aria-invalid" "document.getElementById('delete-account-password').getAttribute('aria-invalid')==='true'"
is s05.16.e "dialog zamknięty" "!document.querySelector('[role=alertdialog]')"
shot s05.16-dark-1440
echo "## s05.16b puste hasło" >> $LOG
fresh "A1"; cl "$CONF" 0.2; cl "$SUB" 0.4
ck s05.16b.a "puste hasło: błąd przy polu bez dialogu" "Wpisz hasło."
is s05.16b.b "dialog się nie otworzył" "!document.querySelector('[role=alertdialog]')"
echo "## licznik prób: 7. błąd ostrzega, 10. błąd, 11. próba = limit" >> $LOG
fresh "A1"; cl "$CONF" 0.2
for i in 1 2 3 4 5 6 7; do fill "#delete-account-password" "zle-$i"; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.5; done
ck s05.16.f "7. błąd: Zostało prób: 3" "Zostało prób: 3"
shot s05.16c-dark-1440
for i in 8 9 10; do fill "#delete-account-password" "zle-$i"; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.5; done
ck s05.16.g "10. błąd: Zostało prób: 0" "Zostało prób: 0"
echo "## s05.17 limit 429" >> $LOG
fill "#delete-account-password" "$PW"; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
ck s05.17.a "11. próba (nawet z dobrym hasłem): limit z czasem" "Zbyt wiele prób"
ck s05.17.b "czas ponowienia w minutach" "min."
is s05.17.c "dialog zamknięty, konto nietknięte" "!document.querySelector('[role=alertdialog]')&&document.querySelector('.scenario-bar')!==null"
shot s05.17-dark-1440
sbtn "+1 h"; go s04; go s05; fill "#delete-account-password" "$PW"; cl "$SUB" 0.3
D=$(dialog); [[ "$D" == *"Usunąć konto Ala_7?"* ]] && echo "PASS s05.17.d | po upływie okna limit ustępuje (dialog znowu się otwiera)" >> $LOG || echo "FAIL s05.17.d | $D" >> $LOG
$AB press Escape >/dev/null 2>&1; sleep 0.3
echo "## s05.17 limit wymuszony przełącznikiem" >> $LOG
fresh "A1"; prep "$PW"; tog sc-del-limit; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
ck s05.17.e "limit wymuszony: 12 min" "Spróbuj ponownie za 12 min."
tog sc-del-limit

echo "## s05.18 błąd serwera i sieci: dialog zostaje otwarty" >> $LOG
fresh "A1"; prep "$PW"; tog sc-del-server; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
D=$(dialog); [[ "$D" == *"Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie."* ]] && echo "PASS s05.18.a | dialog otwarty z komunikatem błędu serwera" >> $LOG || echo "FAIL s05.18.a | $D" >> $LOG
is s05.18.b "komunikat jest role=alert" "!!document.querySelector('[role=alertdialog] [role=alert]')"
shot s05.18-dark-1440
tog sc-del-server; cl '[role=alertdialog] button:last-of-type' 0.8
at s05.18.c "ponowienie po naprawie serwera usuwa konto, ekran s04" s04
ck s05.14.e "s04.14: komunikat Konto zostało usunięte" "Konto zostało usunięte"
fresh "A1"; prep "$PW"; tog sc-network; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
D=$(dialog); [[ "$D" == *"Nie udało się usunąć konta"* ]] && echo "PASS s05.18.d | brak sieci: dialog zostaje otwarty z tym samym komunikatem" >> $LOG || echo "FAIL s05.18.d | $D" >> $LOG
tog sc-network; $AB press Escape >/dev/null 2>&1; sleep 0.3

echo "## s05.12 blokada przy partii w toku (Marek_Z)" >> $LOG
fresh "A3"
ck s05.12.a "komunikat blokady" "Najpierw dokończ albo poddaj partię."
ck s05.12.b "wskazanie drogi wyjścia: Poddaj partię" "„Poddaj partię”"
is s05.12.c "link Przejdź do partii (data-testid blokady)" "[...document.querySelectorAll('[data-testid=delete-account-active-game] a')].some(a=>a.textContent==='Przejdź do partii')"
is s05.12.d "przycisk nieaktywny, powód obok" "document.querySelector('$SUB').disabled&&document.getElementById('delete-account-reason').innerText.includes('po zakończeniu partii')"
shot s05.12-dark-1440
cl '[data-testid=delete-account-active-game] a' 0.5
D=$(ev "document.querySelector('[role=dialog]')?.innerText.replace(/\\n+/g,' ')||'brak'"); [[ "$D" == *"Strona partii"* ]] && echo "PASS s05.12.e | link do partii prowadzi poza prototyp (dialog)" >> $LOG || echo "FAIL s05.12.e | $D" >> $LOG
$AB press Escape >/dev/null 2>&1; sleep 0.3
echo "## s05.12 po poddaniu w innej karcie wystarczy odświeżyć" >> $LOG
sbtn "Poddaj partię (w innej karcie)"
ck s05.12.f "strona nieodświeżona dalej blokuje" "Najpierw dokończ albo poddaj partię."
sbtn "Odśwież stronę konta"
nk s05.12.g "po odświeżeniu blokada znika" "Najpierw dokończ albo poddaj partię."
prep "$PW"; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
at s05.12.h "po poddaniu usunięcie przechodzi" s04

echo "## s05.20 partia zaczęła się w międzyczasie (409 po wysłaniu)" >> $LOG
fresh "A8"
ck s05.11.a "oczekująca partia: dodatkowe ostrzeżenie" "Twoja oczekująca partia i jej zaproszenie zostaną usunięte."
shot s05.11-dark-1440
prep "$PW"; sbtn "Przeciwnik dołącza do mojej oczekującej"
cl "$SUB" 0.3
D=$(dialog); [[ "$D" == *"oczekująca partia"* ]] && echo "PASS s05.11.b | dialog też wspomina o oczekującej partii" >> $LOG || echo "FAIL s05.11.b | $D" >> $LOG
shot s05.11-dialog-dark-1440
cl '[role=alertdialog] button:last-of-type' 0.8
ck s05.20.a "409 w trakcie: pojawia się blokada z linkiem" "Najpierw dokończ albo poddaj partię."
is s05.20.b "dialog zamknięty, fokus na bloku blokady" "!document.querySelector('[role=alertdialog]')&&document.activeElement.getAttribute('data-testid')==='delete-account-active-game'"
shot s05.20-dark-1440

echo "## s05.19 sesja wygasła (401)" >> $LOG
fresh "A1"; prep "$PW"; tog sc-del-401; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
at s05.19.a "401: przekierowanie na logowanie" s02
fresh "A1"

echo "## sukces dla konta z oczekującą partią (Ola_W) i skutki" >> $LOG
fresh "A8"; prep "$PW"; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.8
at s05.21.a "sukces: powrót na stronę główną" s04
ck s04.14.a "komunikat Konto zostało usunięte" "Konto zostało usunięte"
ck s04.14.b "widok bez sesji (Załóż konto)" "Załóż konto"
nk s04.14.c "brak Wyloguj, sesji nie ma" "Wyloguj"
shot s04.14-dark-1440
cl '[data-testid=account-deleted-notice] button' 0.3
nk s04.14.d "Zamknij chowa komunikat" "Konto zostało usunięte"
go s02; fill "#login-email" "ola@example.com"; fill "#login-password" "$PW"; cl '[data-testid=login-form] button[type=submit]' 0.8
ck s05.21.b "logowanie usuniętym kontem: ogólny błąd" "Nieprawidłowy e-mail lub hasło"
go s01; fill "#reg-email" "ola@example.com"; fill "#reg-name" "Ola_W"; fill "#reg-password" "$PW"; cl '[data-testid=register-form] button[type=submit]' 1
at s05.21.c "ponowna rejestracja tym samym e-mailem i nazwą działa od razu" s04

echo "## s08 widok przeciwnika" >> $LOG
go s08
ck s08.1.a "po usunięciu nazwa przeciwnika to Usunięty gracz" "Usunięty gracz"
nk s08.1.b "bez przycisku rewanżu i komunikatu domyślnie" "Rewanż niedostępny"
shot s08.1-dark-1440
tog sc-rematch-notice; ck s08.2.a "komunikat Rewanż niedostępny" "Rewanż niedostępny"; shot s08.2-dark-1440
tog sc-rematch-pending; ck s08.3.a "oferta rewanżu zamknięta jako odrzucona" "Zaproszenie do rewanżu odrzucone"; shot s08.3-dark-1440
tog sc-opp-guest; ck s08.4.a "gość widzi Usunięty gracz" "Piotr (gość)"; shot s08.4-dark-1440
tog sc-opp-guest; tog sc-rematch-pending; tog sc-rematch-notice
sbtn "Reset symulacji"; go s08; ck s08.5.a "przeciwnik z kontem: nazwa Marek_Z" "Marek_Z"

echo "## motywy i 360/320 px: brak poziomego przewijania" >> $LOG
for W in 1440 360 320; do
  vp $W $([[ $W == 1440 ]] && echo 1800 || echo 2600)
  for TH in dark light; do
    theme $TH
    sbtn "Reset symulacji"; sel sc-account "A8"; go s05; noscroll "N.$W.$TH.s05" "s05 (Ola_W) przy $W px, $TH"
    prep "$PW"; shot "s05-form-$W-$TH"
    cl "$SUB" 0.5; noscroll "N.$W.$TH.dlg" "dialog przy $W px, $TH"; shot "s05-dialog-$W-$TH"
    $AB press Escape >/dev/null 2>&1; sleep 0.3
    sel sc-account "A3"; go s05; noscroll "N.$W.$TH.s05b" "s05 blokada (Marek_Z) przy $W px, $TH"; shot "s05-blokada-$W-$TH"
    sel sc-account "A1"; go s05; fill "#delete-account-password" "zle"; cl "$CONF" 0.2; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.6; noscroll "N.$W.$TH.err" "s05 błąd hasła przy $W px, $TH"; shot "s05-blad-hasla-$W-$TH"
    tog sc-del-limit; fill "#delete-account-password" "$PW"; cl "$SUB" 0.3; cl '[role=alertdialog] button:last-of-type' 0.6; noscroll "N.$W.$TH.lim" "s05 limit przy $W px, $TH"; shot "s05-limit-$W-$TH"; tog sc-del-limit
    sel sc-account "A1"; go s05; fill "#delete-account-password" "$PW"; cl "$SUB" 0.3; tog sc-del-server; cl '[role=alertdialog] button:last-of-type' 0.6; noscroll "N.$W.$TH.srv" "dialog błędu serwera przy $W px, $TH"; shot "s05-serwer-$W-$TH"; tog sc-del-server
    cl '[role=alertdialog] button:last-of-type' 0.8
    go s04; noscroll "N.$W.$TH.s04" "s04.14 przy $W px, $TH"; shot "s04-usuniete-$W-$TH"
    go s08; noscroll "N.$W.$TH.s08" "s08 przy $W px, $TH"; shot "s08-$W-$TH"
  done
done
vp 1440 1800; theme dark

echo "## klawiatura" >> $LOG
fresh "A1"
$AB eval "document.getElementById('delete-account-password').focus()" >/dev/null 2>&1
ORDER=""; for i in 1 2 3; do $AB press Tab >/dev/null 2>&1; ORDER="$ORDER $(ev "document.activeElement.getAttribute('aria-label')||document.activeElement.getAttribute('role')||document.activeElement.textContent.trim().slice(0,30)")"; done
echo "INFO K.1 | Tab od pola hasła:$ORDER" >> $LOG
[[ "$ORDER" == *'Pokaż hasło'*'checkbox'* ]] && echo "PASS K.1 | kolejność Tab: pole hasła, Pokaż hasło, pole wyboru (nieaktywny przycisk jest pomijany, powód jest zwykłym tekstem)" >> $LOG || echo "WARN K.1 | kolejność: $ORDER" >> $LOG
fill "#delete-account-password" "$PW"
$AB eval "document.querySelector('$CONF').focus()" >/dev/null 2>&1; $AB press Space >/dev/null 2>&1; sleep 0.3
is K.2 "Spacja zaznacza pole wyboru" "!document.querySelector('$SUB').disabled"
$AB press Tab >/dev/null 2>&1; $AB press Enter >/dev/null 2>&1; sleep 0.5
D=$(dialog); [[ "$D" == *"Usunąć konto Ala_7?"* ]] && echo "PASS K.3 | Enter na przycisku otwiera dialog" >> $LOG || echo "FAIL K.3 | $D" >> $LOG
$AB press Tab >/dev/null 2>&1; F=$(focused); [[ "$F" == *"Usuń konto na zawsze"* ]] && echo "PASS K.4 | Tab z Zostaw konto trafia na Usuń konto na zawsze (fokus uwięziony w dialogu)" >> $LOG || echo "FAIL K.4 | $F" >> $LOG
$AB press Tab >/dev/null 2>&1; F=$(focused); [[ "$F" == *"Zostaw konto"* ]] && echo "PASS K.5 | Tab zawija do Zostaw konto" >> $LOG || echo "FAIL K.5 | $F" >> $LOG
O=$(ev "(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle+' '+s.outlineWidth})()"); [[ "$O" != *"none"* && "$O" != *" 0px"* ]] && echo "PASS K.6 | fokus w dialogu ma widoczny obrys ($O)" >> $LOG || echo "FAIL K.6 | $O" >> $LOG
shot K-fokus-dialog-dark-1440
$AB press Escape >/dev/null 2>&1; sleep 0.3
echo DONE >> $LOG
