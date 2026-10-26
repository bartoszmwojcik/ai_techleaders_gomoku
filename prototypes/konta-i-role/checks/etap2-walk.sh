cd /home/bartek/Development/ai_techleaders_gomoku
AB="node_modules/.bin/agent-browser --session konta-i-role"
LOG=${LOG:-$PWD/prototypes/konta-i-role/checks/etap2-log.txt}; : > $LOG
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
$AB open "$URL?fast" >/dev/null 2>&1; sleep 1; $AB click "summary" >/dev/null 2>&1; sleep 0.3

echo "## s01" >> $LOG
$AB eval "document.querySelector('[data-testid=register-form] button[type=submit]').click()" >/dev/null 2>&1; sleep 0.5; ck s01.2 "puste pola: błędy" "Podaj poprawny adres e-mail."
reg kuba@example.com Marek_Z; ck s01.3 "nazwa zajęta przy polu" "Ta nazwa jest zajęta"
V=$($AB eval "document.getElementById('reg-email').value" | tail -1); [[ "$V" == '"kuba@example.com"' ]] && echo "PASS s01.3b | e-mail zostaje po błędzie" >> $LOG || echo "FAIL s01.3b | $V" >> $LOG
reg kuba@example.com marek-z; ck s01.3c "nazwa podobna (normalizacja)" "Ta nazwa jest zajęta"
reg ALA@example.com Kuba_P; ck s01.4 "zajęty e-mail: jednolity komunikat" "Jeśli masz już konto"; nk s01.4b "komunikat nie wskazuje pola" "Ta nazwa jest zajęta"
reset; reg kuba@example.com Admin; ck s01.2b "zastrzeżona" "zastrzeżona"
reset; reg kuba@example.com Kuba_P krotkie; ck s01.2c "hasło za krótkie" "co najmniej 8 znaków"
reset; tog sc-limit; reg kuba@example.com Kuba_P; ck s01.6 "limit prób" "Zbyt wiele prób"; tog sc-limit
reset; tog sc-server; reg kuba@example.com Kuba_P; ck s01.7 "błąd serwera" "Nie udało się założyć konta"; tog sc-server
reset; tog sc-network; reg kuba@example.com Kuba_P; ck s01.8 "brak sieci" "Brak połączenia"
V=$($AB eval "document.getElementById('reg-email').value+'|'+document.getElementById('reg-password').value" | tail -1); [[ "$V" == '"kuba@example.com|"' ]] && echo "PASS s01.8b | e-mail zachowany, hasło wyczyszczone" >> $LOG || echo "FAIL s01.8b | $V" >> $LOG; tog sc-network
reset; tog sc-already; reg kuba@example.com Kuba_P; ck s01.9 "już zalogowany (409)" "Jesteś już zalogowany"; btn "Odśwież stronę"; at s01.9b "po odświeżeniu strona główna" s04; ck s01.9c "zalogowany jako Ala_7" "Ala_7"
go s01; at s01.11 "zalogowany na s01 trafia na s04" s04
reset; sel sc-provider "Brak dostawcy (wysyłka nie działa)"; go s01; nk s01.12 "s01.12 wycofany: rejestracja działa bez poczty" "Rejestracja jest chwilowo niedostępna"; ck s01.12b "formularz dostępny mimo braku poczty" "Załóż konto"
reset; acct A6; go s01; ck s01.13 "gość z aktywną partią" "Trwa Twoja partia jako gość"

echo "## s02" >> $LOG
reset; go s02; log ala@example.com zle-haslo-zle-haslo; ck s02.3 "błędne dane" "Nieprawidłowy e-mail lub hasło"
log nieznany@example.com zle; ck s02.3b "nieznany e-mail: ta sama treść" "Nieprawidłowy e-mail lub hasło"
log "" ""; ck s02.4 "puste pola" "Wpisz hasło."
tog sc-limit; log ala@example.com; ck s02.6 "limit" "Zbyt wiele prób"; tog sc-limit
tog sc-server; log ala@example.com; ck s02.7 "serwer" "Nie udało się zalogować"; tog sc-server
tog sc-network; log ala@example.com; ck s02.8 "sieć" "Brak połączenia"; tog sc-network
tog sc-already; log ala@example.com; ck s02.12 "409" "Jesteś już zalogowany"; tog sc-already
reset; go s05; at s02.2 "s05 bez sesji prowadzi na s02" s02; log ala@example.com; at s02.9 "po logowaniu wraca na s05 (next)" s05; ck s02.9b "konto Ala" "ala@example.com"
go s02; at s02.10 "zalogowany na s02 trafia dalej" s04
reset; acct A6; go s02; ck s02.13 "gość z aktywną partią nie może się logować" "Trwa Twoja partia jako gość"
reset; acct A5; ck s02.x1 "Ewa przed +7 dni zalogowana" "Ewa_B"; reset; go s02; log ewa@example.com; ck s02.x2 "konto Ewy istnieje" "Ewa_B"
reset; sbtn "+14 dni"; go s02; log ewa@example.com; ck s02.3c "po +14 dni niepotwierdzone konto bez partii usunięte: ta sama porażka" "Nieprawidłowy e-mail lub hasło"
reset; go s02; log ala@example.com; sbtn "+31 dni (sesja wygasa)"; at s02.11a "(info)" s04; ck s02.11 "po +31 dniach sesja wygasła: widok niezalogowany" "Załóż konto"

echo "## s03/s04/s06" >> $LOG
reset; reg kuba@example.com Kuba_P; at s04.2a "po rejestracji s04" s04; ck s04.2 "baner" "Potwierdź adres e-mail"; ck s04.2b "Lobby w nagłówku niepotwierdzonego (BR-26)" "Lobby"
nk s04.2c "akcje gry nie są zablokowane z powodem" "tworzyć partie i wchodzić do lobby"; ck s04.2d "akcje gry aktywne" "Utwórz zaproszenie"
go s06; ck s06.1 "wiadomość w skrzynce" "Cześć Kuba_P"; btn "Potwierdź adres e-mail"; at s03.1a "link prowadzi na s03" s03; ck s03.1 "przed kliknięciem" "Potwierdź e-mail"; nk s03.1b "nie ujawnia adresu" "kuba@"
btn "Potwierdź e-mail"; sleep 0.4; ck s03.4 "sukces zalogowany" "Adres potwierdzony"; btn "Przejdź dalej"; ck s04.3 "potwierdzony: Lobby w nagłówku" "Lobby"; nk s04.3b "baner znika" "Potwierdź adres e-mail"
go s06; btn "Potwierdź adres e-mail"; ck s03.5a "użyty link: komunikat" "Link wygasł lub został już użyty."; ck s03.8 "potwierdzony zalogowany: już potwierdzony" "Adres jest już potwierdzony"
reset; reg kuba@example.com Kuba_P; sbtn "+24 h (link wygasa)"; go s06; btn "Potwierdź adres e-mail"; ck s03.5 "wygasły (24 h)" "Link wygasł"; ck s03.5b "zalogowany: Wyślij nowy link" "Wyślij nowy link"
btn "Wyślij nowy link"; ck s03.9 "nowy link wysłany" "Wysłano"
tog sc-elsewhere; go s06; $AB eval "[...document.querySelectorAll('.screen.is-current button')].filter(b=>b.textContent.includes('Potwierdź adres')).pop().click()" >/dev/null 2>&1; sleep 0.5; btn "Wyślij nowy link"; ck s03.x "409 na stronie błędu" "Ten adres jest już potwierdzony"; tog sc-elsewhere
reset; reg kuba@example.com Kuba_P; sel sc-provider "Awaria (502)"; sbtn "+24 h (link wygasa)"; go s06; btn "Potwierdź adres e-mail"; btn "Wyślij nowy link"; ck s03.11 "502" "Nie udało się wysłać wiadomości"
sel sc-provider "Dzienny limit wyczerpany (503)"; btn "Wyślij nowy link"; ck s03.12 "503" "chwilowo niedostępna"
sel sc-provider "Działa"; btn "Wyślij nowy link"; btn "Wyślij nowy link"; ck s03.10 "limit po 3 wysyłkach" "Za wiele prób"
reset; reg kuba@example.com Kuba_P; acct A0; go s06; btn "Potwierdź adres e-mail"; ck s03.7a "bez sesji: potwierdza" "Potwierdź e-mail"
btn "Potwierdź e-mail"; sleep 0.4; ck s03.3 "sukces niezalogowany: link do logowania" "Nie jesteś zalogowany"
reset; reg kuba@example.com Kuba_P; sbtn "+24 h (link wygasa)"; acct A0; go s06; btn "Potwierdź adres e-mail"; ck s03.6 "wygasły niezalogowany" "Zaloguj się, aby wysłać nowy link"
reset; reg kuba@example.com Kuba_P; sel sc-link "Bez tokenu w adresie"; go s06; btn "Potwierdź adres e-mail"; ck s03.7 "brak tokenu" "Link wygasł lub został już użyty."; sel sc-link "Według stanu (ważny, użyty, wygasły)"
reset; reg kuba@example.com Kuba_P; tog sc-server; go s06; btn "Potwierdź adres e-mail"; btn "Potwierdź e-mail"; sleep 0.4; ck s03.13 "500 przy potwierdzaniu" "Nie udało się potwierdzić adresu"; tog sc-server
tog sc-network; btn "Spróbuj ponownie"; btn "Potwierdź e-mail"; sleep 0.4; ck s03.14 "sieć przy potwierdzaniu" "Brak połączenia"; tog sc-network
reset; reg kuba@example.com Kuba_P; go s06; btn "Potwierdź adres e-mail"; acct A3; btn "Potwierdź e-mail"; sleep 0.4; ck s03.15 "inne konto: sukces bez ujawniania" "Adres potwierdzony"; nk s03.15b "nie ujawnia nazwy" "Kuba"
echo "## baner s04" >> $LOG
reset; reg kuba@example.com Kuba_P; btn "Wyślij ponownie"; ck s04.5 "wysłano" "Wysłano. Nowy link zastępuje poprzedni."
btn "Wyślij ponownie"; btn "Wyślij ponownie"; btn "Wyślij ponownie"; ck s04.6 "limit po 3" "Za wiele prób. Spróbuj za 41 min."
reset; reg kuba@example.com Kuba_P; sel sc-provider "Awaria (502)"; btn "Wyślij ponownie"; ck s04.7 "502" "Nie udało się wysłać wiadomości"
sel sc-provider "Dzienny limit wyczerpany (503)"; btn "Wyślij ponownie"; ck s04.8 "503" "Spróbuj jutro"
reset; reg kuba@example.com Kuba_P; tog sc-elsewhere; btn "Wyślij ponownie"; ck s04.9 "409" "Ten adres jest już potwierdzony."; btn "Odśwież stronę"; nk s04.9b "baner znika po odświeżeniu" "Potwierdź adres e-mail"
reset; reg kuba@example.com Kuba_P; tog sc-expired; btn "Wyślij ponownie"; ck s04.10 "401" "Sesja wygasła."
reset; reg kuba@example.com Kuba_P; tog sc-db; ck s04.11 "baza niedostępna: widok niezalogowany" "Załóż konto"; tog sc-db
tog sc-loading; ck s04.12 "ładowanie" "Ładowanie strony głównej"; go s05; ck s05.9 "ładowanie konta" "Ładowanie konta"; tog sc-loading
reset; acct A1; go s04; ck s04.3d "Ala: akcje" "Utwórz zaproszenie"; btn "Utwórz zaproszenie"; D=$($AB eval "document.querySelector('[role=dialog]')?.innerText" | tail -1); [[ "$D" == *"Poza tym prototypem"* ]] && echo "PASS s04.x | Utwórz zaproszenie: dialog Poza prototypem" >> $LOG || echo "FAIL s04.x | $D" >> $LOG; btn "Wróć do prototypu"
lnk "Lobby"; D=$($AB eval "document.querySelector('[role=dialog]')?.innerText" | tail -1); [[ "$D" == *"Lobby"* ]] && echo "PASS s04.y | Lobby: dialog" >> $LOG || echo "FAIL s04.y | $D" >> $LOG; btn "Wróć do prototypu"
echo "## s05" >> $LOG
reset; acct A1; go s05; ck s05.1 "potwierdzony" "Potwierdzony"; bex "Wyloguj"; at s05.7 "po wylogowaniu s04" s04; ck s05.7b "widok niezalogowany" "Załóż konto"
reset; acct A2; go s05; ck s05.2 "niepotwierdzony: baner + status" "Niepotwierdzony"; ck s05.2b "baner" "Potwierdź adres e-mail"
reset; acct A3; go s05; bex "Wyloguj"; D=$($AB eval "document.querySelector('[role=alertdialog]')?.innerText" | tail -1); [[ "$D" == *"Trwa partia"* ]] && echo "PASS s05.4 | dialog przy aktywnej partii" >> $LOG || echo "FAIL s05.4 | $D" >> $LOG; btn "Zostań zalogowany"; at s05.4b "anulowanie zostaje na s05" s05; bex "Wyloguj"; bex "Wyloguj"; at s05.4c "potwierdzenie wylogowuje" s04
reset; acct A1; go s05; tog sc-server; bex "Wyloguj"; sleep 0.4; at s05.5 "500: sesja i tak zakończona" s04; ck s05.5b "komunikat" "serwer nie potwierdził"; tog sc-server
reset; acct A1; go s05; tog sc-db; go s04; go s05; at s05.8 "baza niedostępna: przekierowanie na logowanie" s02; tog sc-db
reset; go s05; at s05.6 "brak sesji: logowanie" s02
echo "## s06" >> $LOG
reset; go s06; ck s06.2 "pusta skrzynka" "Brak wiadomości"

echo "## s07, baner nieblokujący, hasło 8, 14 dni" >> $LOG
reset; go s07; ck s07.1 "niezalogowany: trzy wybory" "Graj jako gość"; ck s07.1b "twórca i kod" "Marek_Z zaprasza"
btn "Graj jako gość"; ck s07.2 "ostrzeżenie dla gościa" "Grasz bez konta"
btn "Rozumiem, graj jako gość"; D=$($AB eval "document.querySelector('[role=dialog]')?.innerText" | tail -1); [[ "$D" == *"Partia gościa"* ]] && echo "PASS s07.2b | gość: dialog Poza prototypem" >> $LOG || echo "FAIL s07.2b | $D" >> $LOG; btn "Wróć do prototypu"
go s02; ck s02.13b "gość z partią nie może się zalogować po s07" "Trwa Twoja partia jako gość"
reset; go s07; btn "Załóż konto"; at s07.n1 "Załóż konto z s07 prowadzi na s01" s01; reg kuba@example.com Kuba_P osiem-zn; at s07.n2 "po rejestracji powrót na s07 (next)" s07; ck s07.3 "zalogowany: Dołącz do partii" "Dołącz do partii"; nk s07.3b "zalogowany nie ma opcji gościa" "Graj jako gość"
sel sc-invite "Już uczestnik"; ck s07.4 "już uczestnik" "Już jesteś w tej partii"; sel sc-invite "Własne zaproszenie"; ck s07.5 "własne zaproszenie" "To Twoje zaproszenie"
sel sc-invite "Ma inną partię"; ck s07.6 "inna partia" "Masz już partię"; sel sc-invite "Ma własną oczekującą"; ck s07.7 "oczekująca" "Anuluj moją partię i dołącz"
sel sc-invite "Limit prób"; ck s07.8 "limit" "Zbyt wiele prób"; sel sc-invite "Nieważne"; ck s07.9 "nieważne" "To zaproszenie jest już nieważne"; sel sc-invite "Według sesji"
reset; reg kuba@example.com Kuba_P siedem7; ck s01.2d "hasło 7 znaków odrzucone" "co najmniej 8 znaków"
reset; reg kuba@example.com Kuba_P osiem-zn; btn "Zamknij"; nk s04.13 "baner zamknięty" "Potwierdź adres e-mail"; sbtn "+7 dni"; ck s04.13b "po 7 dniach baner wraca" "Potwierdź adres e-mail"
reset; acct A2; sbtn "+14 dni"; go s04; ck s04.14 "A2 po 14 dniach bez partii: konto usunięte (widok niezalogowany)" "Załóż konto"
reset; acct A2; sbtn "Rozegraj partię"; sbtn "+14 dni"; go s04; ck s04.15 "A2 z partią po 14 dniach zostaje" "Zalogowano jako Kuba_P"
echo DONE >> $LOG
