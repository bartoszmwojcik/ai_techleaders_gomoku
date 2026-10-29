#!/usr/bin/env bash
# Browser walk for game-from-invitation revision-002 (agent-browser, isolated session, file:// URL). Etap A (regresja z rewizji 001) + etap B.
# Usage: evidence/walk.sh   (from anywhere; run `npm`-free, needs node_modules/.bin/agent-browser)
ROOT="$(cd "$(dirname "$0")/../../../../../.." && pwd)"
REV="$ROOT/.ai/prototypes/discovery/game-from-invitation/revision-002"
EV="$REV/evidence"
B="$ROOT/node_modules/.bin/agent-browser"
SES="gfi-walk-$$"
URL="file://$REV/index.html"
LOG="$EV/walk-log.txt"
: > "$LOG"
PASS=0; FAIL=0
ab() { "$B" --session "$SES" "$@"; }
ev() { ab eval "$1" 2>/dev/null | tail -1; }
A() { # id, description, js expression that must be true
  local r; r="$(ev "$3")"
  if [ "$r" = "true" ]; then PASS=$((PASS+1)); echo "PASS $1 | $2" | tee -a "$LOG"
  else FAIL=$((FAIL+1)); echo "FAIL $1 | $2 | got: $r | expr: $3" | tee -a "$LOG"; fi
}
shot() { ab screenshot "$EV/$1" >/dev/null 2>&1; echo "SHOT $1" >> "$LOG"; }
has() { echo "T().indexOf($(printf '%s' "$1" | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))'))>=0"; }
hasnt() { echo "T().indexOf($(printf '%s' "$1" | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))'))<0"; }
H() { ab eval "location.hash='$1'" >/dev/null 2>&1; sleep 0.4; }
role() { ab select "#t-role" "$1" >/dev/null 2>&1; sleep 0.3; }
reset() { ab click "#reset" >/dev/null 2>&1; sleep 0.5; }
cleanup() { ab close >/dev/null 2>&1; echo "TOTAL PASS=$PASS FAIL=$FAIL" | tee -a "$LOG"; }
trap cleanup EXIT

ab open "$URL" >/dev/null 2>&1; sleep 1.2
ev 'window.T=function(){return document.querySelector("main > section.active").innerText}; window.ST=function(){return document.getElementById("state-id").textContent}; window.AE=function(){return document.activeElement.id}; window.SH=function(id){return ST().split(" + ").indexOf(id)>=0}; window.CS=function(sel){var t=document.querySelector("[data-testid="+sel+"] .ct").textContent.split(":");return parseInt(t[0],10)*60+parseInt(t[1],10)}; true' >/dev/null

# ---------- W: start, p01 ----------
A W01 "start: panel główny, stan p01.1" 'ST()==="p01.1" && T().indexOf("Panel główny")>=0'
A W02 "numer rewizji w pasku i tytule" 'document.querySelector("[data-testid=revision]").textContent==="Rewizja 2" && document.title.indexOf("rewizja 2")>=0'
A W03 "stały czas demo" 'document.getElementById("clock").textContent==="poniedziałek 2026-10-26 10:00"'
A W04 "fokus na nagłówku, bez obrysu" 'AE()==="home-h" && getComputedStyle(document.activeElement).outlineStyle==="none"'
A W05 "przycisk Utwórz zaproszenie i link Masz kod?" 'T().indexOf("Utwórz zaproszenie")>=0 && T().indexOf("Masz kod?")>=0'
shot 01-p01-panel.png
ab press Tab >/dev/null 2>&1
A W06 "klawiatura: Tab z nagłówka na przycisk Utwórz zaproszenie" 'AE()==="create"'
A W07 "widoczny fokus przycisku (outline)" 'getComputedStyle(document.activeElement).outlineStyle!=="none"'
A W08 "p01.2 przycisk zajęty po kliknięciu" '(function(){document.getElementById("create").click();return ST()==="p01.2" && document.getElementById("create").disabled && document.getElementById("create").textContent==="Tworzenie zaproszenia…"})()'
sleep 1.1
A W09 "po sukcesie: p03.1, nagłówek partii" 'ST()==="p03.1" && T().indexOf("Partia czeka na przeciwnika")>=0'
A W10 "fokus na nagłówku partii bez obrysu" 'AE()==="game-h" && getComputedStyle(document.activeElement).outlineStyle==="none"'

# ---------- p03 ----------
A P01 "p03.1 link zaproszenia" 'document.getElementById("invite-link").value==="https://gomoku.example/invite/ABCD-EFGH"'
A P02 "p03.1 kod ABCD-EFGH dużą czcionką" 'document.querySelector("[data-testid=invite-code]").textContent==="ABCD-EFGH" && parseFloat(getComputedStyle(document.querySelector("[data-testid=invite-code]")).fontSize)>=28'
A P03 "p03.1 Ważne do wtorek 2026-10-27 10:00" "$(has 'Ważne do wtorek 2026-10-27 10:00')"
A P04 "p03.1 przyciski Kopiuj, Udostępnij, Anuluj zaproszenie" 'T().indexOf("Kopiuj")>=0 && T().indexOf("Udostępnij")>=0 && T().indexOf("Anuluj zaproszenie")>=0'
A P05 "p03.1 role=status Czekamy na przeciwnika…" 'document.querySelector("[role=status][data-testid=wait-status]").textContent==="Czekamy na przeciwnika…"'
shot 02-p03-oczekiwanie.png
ab click "#copy" >/dev/null 2>&1; sleep 0.3
A P06 "p03.2 skopiowano" 'ST()==="p03.2" && document.getElementById("copy-status").textContent==="Skopiowano link do schowka."'
shot 03-p03-skopiowano.png
ab check "#t-noclip" >/dev/null 2>&1; sleep 0.3
ab click "#copy" >/dev/null 2>&1; sleep 0.3
A P07 "p03.3 brak schowka: zaznaczenie tekstu linku" 'ST()==="p03.3" && AE()==="invite-link" && document.activeElement.selectionStart===0 && document.activeElement.selectionEnd===document.activeElement.value.length && document.getElementById("copy-status").textContent.indexOf("skopiuj go ręcznie")>=0'
shot 04-p03-brak-schowka.png
ab uncheck "#t-noclip" >/dev/null 2>&1; sleep 0.3
ab click "#share" >/dev/null 2>&1; sleep 0.3
A P08 "Udostępnij: komunikat o telefonie" 'document.getElementById("share-status").textContent==="Udostępnianie dostępne tylko na telefonie"'
ab check "#t-noshare" >/dev/null 2>&1; sleep 0.3
A P09 "p03.4 Udostępnij ukryty" 'ST()==="p03.4" && !document.getElementById("share") && T().indexOf("Udostępnij")<0'
shot 05-p03-bez-udostepnij.png
ab uncheck "#t-noshare" >/dev/null 2>&1; sleep 0.3
ab check "#t-pollerr" >/dev/null 2>&1; sleep 1.5
A P10 "p03.10 odpytywanie: ponawianie (próba)" 'document.querySelector("[data-testid=wait-status]").textContent.indexOf("Ponawiamy sprawdzanie")>=0'
sleep 2.5
A P11 "p03.10 po 3 nieudanych: baner błędu role=alert" 'ST()==="p03.10" && !!document.querySelector("#poll [role=alert]") && T().indexOf("Nie udało się sprawdzić, czy przeciwnik dołączył")>=0'
shot 06-p03-blad-odpytywania.png
ab uncheck "#t-pollerr" >/dev/null 2>&1
ab click "#poll-retry" >/dev/null 2>&1; sleep 0.5
A P12 "po ustąpieniu błędu: znów Czekamy na przeciwnika…" 'ST()!=="p03.10" && document.querySelector("[data-testid=wait-status]").textContent==="Czekamy na przeciwnika…"'
# dialog
ab click "#cancel" >/dev/null 2>&1; sleep 0.4
A D01 "p03.6 dialog potwierdzenia otwarty, fokus na Wróć" 'ST()==="p03.6" && !!document.querySelector("dialog[open]") && AE()==="cancel-back"'
A D02 "dialog: tytuł i dostępna nazwa" 'document.querySelector("dialog").getAttribute("aria-labelledby")==="dlg-h" && document.getElementById("dlg-h").textContent==="Anulować zaproszenie?"'
shot 07-p03-dialog-anulowania.png
ab press Escape >/dev/null 2>&1; sleep 0.3
A D03 "Esc zamyka dialog, fokus wraca na Anuluj zaproszenie" '!document.querySelector("dialog") && AE()==="cancel" && ST()==="p03.1"'
ab click "#cancel" >/dev/null 2>&1; sleep 0.3
ab press Tab >/dev/null 2>&1
A D04 "dialog: Tab przechodzi na potwierdzenie" 'AE()==="cancel-confirm"'
ab press Tab >/dev/null 2>&1
A D05 "dialog modalny: fokus nie ucieka do treści strony pod spodem" '!document.activeElement.closest("main,header,aside")'
ab click "#cancel-back" >/dev/null 2>&1; sleep 0.3
A D06 "Wróć zamyka dialog, partia nadal czeka" '!document.querySelector("dialog") && ST()==="p03.1"'
ab click "#cancel" >/dev/null 2>&1; sleep 0.3
A D07 "p03.7 anulowanie w toku (przycisk zajęty)" '(function(){document.getElementById("cancel-confirm").click();return ST()==="p03.7" && document.getElementById("cancel-confirm").disabled && document.getElementById("cancel-confirm").textContent==="Anulowanie…"})()'
shot 08-p03-anulowanie-w-toku.png
sleep 1.2
A D08 "p03.8 po anulowaniu: twórca na stronie głównej z komunikatem" 'location.hash==="#/home" && T().indexOf("Zaproszenie zostało anulowane. Link jest już nieważny.")>=0'
shot 09-p03-po-anulowaniu-panel.png
H '#/invite/ABCD-EFGH'
A D09 "link po anulowaniu: To zaproszenie jest już nieważne (s07.9)" "ST()===\"s07.9\" && $(has 'To zaproszenie jest już nieważne')"
H '#/game'
A D10 "partia anulowana: brak dostępu dla twórcy" 'ST()==="p07.2" && T().indexOf("Ta partia nie istnieje albo nie masz do niej dostępu")>=0'

# ---------- p01 stany ----------
reset
for v in active limit server net; do
  ab select "#t-create" $v >/dev/null 2>&1
  ab click "#create" >/dev/null 2>&1; sleep 1.1
  case $v in
    active) A Q01 "p01.3 masz już partię (z linkiem)" 'ST()==="p01.3" && T().indexOf("Masz już partię")>=0 && !!document.querySelector("[data-testid=to-active]") && !!document.querySelector("[role=alert]")'; shot 10-p01-masz-partie.png;;
    limit) A Q02 "p01.5 limit utworzeń z czasem" 'ST()==="p01.5" && T().indexOf("Limit to 10 utworzeń na godzinę. Spróbuj ponownie za 23 min.")>=0'; shot 11-p01-limit.png;;
    server) A Q03 "p01.6 błąd serwera + Spróbuj ponownie" 'ST()==="p01.6" && T().indexOf("po stronie serwera")>=0 && !!document.getElementById("create-retry")'; shot 12-p01-blad-serwera.png;;
    net) A Q04 "p01.7 brak sieci" 'ST()==="p01.7" && T().indexOf("Nie udało się połączyć z serwerem. Spróbuj ponownie.")>=0'; shot 13-p01-brak-sieci.png;;
  esac
  A Q05 "po błędzie ($v) nie ma partii i fokus wraca na przycisk" 'AE()==="create" && location.hash==="#/home"'
done
ab select "#t-create" ok >/dev/null 2>&1; sleep 0.2
ab click "#create-retry" >/dev/null 2>&1; sleep 1.2
A Q06 "Spróbuj ponownie po usunięciu błędu: powodzenie (p03.1)" 'ST()==="p03.1"'
# oczekująca partia (L01)
H '#/home'
ab select "#t-create" waiting >/dev/null 2>&1
ab click "#create" >/dev/null 2>&1; sleep 1.2
A Q07 "p01.4 ma oczekującą partię: przejście do niej z komunikatem" 'location.hash==="#/game" && ST()==="p03.1" && T().indexOf("Masz już oczekującą partię.")>=0'
shot 14-p01-masz-oczekujaca.png
ab select "#t-create" ok >/dev/null 2>&1
H '#/home'
A Q08 "panel: link Wróć do partii przy oczekującej partii" 'T().indexOf("Wróć do partii")>=0'
ab click "#create" >/dev/null 2>&1; sleep 1.2
A Q09 "oczekująca partia + Utwórz: przejście do tej samej partii (L01)" 'location.hash==="#/game" && ST()==="p03.1"'

# ---------- p02 /join ----------
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role friend
H '#/home'
ab click "[data-testid=have-code]" >/dev/null 2>&1; sleep 0.4
A J01 "p02.1 /join: pierwsze pole ma fokus" 'location.hash==="#/join" && ST()==="p02.1" && AE()==="f-code"'
A J02 "pole z etykietą Kod zaproszenia" 'document.querySelector("label[for=f-code]").textContent==="Kod zaproszenia"'
shot 15-p02-kod.png
ab fill "#f-code" "ABC" >/dev/null 2>&1; ab press Enter >/dev/null 2>&1; sleep 0.4
A J03 "p02.2 za krótki kod: błąd przy polu, role aria-invalid, fokus w polu" 'ST()==="p02.2" && T().indexOf("Sprawdź kod: ma 8 znaków.")>=0 && document.getElementById("f-code").getAttribute("aria-invalid")==="true" && AE()==="f-code"'
shot 16-p02-za-krotki.png
ab select "#t-code" limit >/dev/null 2>&1
ab fill "#f-code" "abcd-efgh" >/dev/null 2>&1; ab press Enter >/dev/null 2>&1; sleep 0.4
A J04 "p02.3 limit prób: Zbyt wiele prób — spróbuj za chwilę (alert)" 'ST()==="p02.3" && T().indexOf("Zbyt wiele prób — spróbuj za chwilę")>=0 && !!document.querySelector("#join [role=alert]")'
shot 17-p02-limit.png
ab select "#t-code" ok >/dev/null 2>&1
ab fill "#f-code" "ZZZZ-ZZZZ" >/dev/null 2>&1; ab click "#join-submit" >/dev/null 2>&1
A J05 "p02.5 sprawdzanie kodu (przycisk zajęty)" 'ST()==="p02.5" || document.getElementById("join-submit").textContent==="Sprawdzanie kodu…"'
sleep 1
A J06 "p02.4 nieprawidłowy kod: s07.9 nieważne" "location.hash.indexOf('#/invite/ZZZZ-ZZZZ')===0 && ST()===\"s07.9\" && $(has 'To zaproszenie jest już nieważne')"
ab click "#invite a[href='#/join']" >/dev/null 2>&1; sleep 0.4
ab fill "#f-code" "abcd efgh" >/dev/null 2>&1; ab press Enter >/dev/null 2>&1; sleep 1.1
A J07 "poprawka kodu (małe litery, spacja): sukces, s07 dla znajomego z kontem" 'location.hash==="#/invite/ABCD-EFGH" && ST()==="s07.3" && T().indexOf("Dołącz do partii")>=0'
H '#/join'
ab select "#t-code" invalid >/dev/null 2>&1
ab fill "#f-code" "ABCD-EFGH" >/dev/null 2>&1; ab press Enter >/dev/null 2>&1; sleep 1.1
A J08 "wynik kodu: nieważny (wymuszony)" 'ST()==="s07.9"'
ab select "#t-code" ok >/dev/null 2>&1

# ---------- s07 ----------
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role anon
H '#/invite/ABCD-EFGH'
A S01 "s07.1 niezalogowany: trzy wybory" 'ST()==="s07.1" && T().indexOf("Ala_7 zaprasza Cię do partii Gomoku")>=0 && !!document.querySelector("[data-testid=invite-login]") && !!document.querySelector("[data-testid=invite-signup]") && !!document.querySelector("[data-testid=guest-open]")'
A S02 "s07.1 bez przycisku Dołącz do partii" "$(hasnt 'Dołącz do partii')"
A S03 "fokus na nagłówku zaproszenia" 'AE()==="invite-h" && getComputedStyle(document.activeElement).outlineStyle==="none"'
shot 18-s07-niezalogowany.png
ab click "[data-testid=invite-login]" >/dev/null 2>&1; sleep 0.4
A S04 "dialog Poza tym prototypem (logowanie)" 'document.getElementById("dlg-h").textContent==="Poza tym prototypem" && AE()==="outside-back" && document.querySelector("dialog").innerText.indexOf("wrócisz na to samo zaproszenie")>=0'
shot 19-s07-dialog-poza-prototypem.png
ab press Escape >/dev/null 2>&1; sleep 0.3
A S05 "Esc zamyka dialog, fokus wraca na przycisk" '!document.querySelector("dialog") && document.activeElement.getAttribute("data-testid")==="invite-login"'
ab click "[data-testid=invite-signup]" >/dev/null 2>&1; sleep 0.3
ab click "#outside-back" >/dev/null 2>&1; sleep 0.4
A S06 "Wróć do zaproszenia: powrót na /invite/ABCD-EFGH (L19)" '!document.querySelector("dialog") && location.hash==="#/invite/ABCD-EFGH" && ST()==="s07.1"'
ab click "#hdr-login" >/dev/null 2>&1; sleep 0.3
A S06b "przycisk Zaloguj się w nagłówku: ten sam dialog" '!!document.querySelector("dialog[open]")'
ab press Escape >/dev/null 2>&1; sleep 0.3
ab click "#guest-open" >/dev/null 2>&1; sleep 0.3
A S07 "s07.2 ostrzeżenie gościa i Rozumiem, graj jako gość" 'ST()==="s07.2" && document.getElementById("guest-warning").textContent==="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii" && document.getElementById("guest-go").textContent==="Rozumiem, graj jako gość" && document.getElementById("guest-open").getAttribute("aria-expanded")==="true"'
shot 20-s07-ostrzezenie-goscia.png
ab click "#guest-go" >/dev/null 2>&1; sleep 1.2
A S08 "gość dołączył: p04.1, rola Gość" 'ST()==="p04.1" && document.getElementById("t-role").value==="guest" && location.hash==="#/game"'
A S09 "p04.1 treść Czekamy, aż Ala_7 otworzy partię…" "$(has 'Czekamy, aż Ala_7 otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)')"
A S10 "p04.4 stałe ostrzeżenie gościa" "$(has 'Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii')"
shot 21-p04-czekamy-gosc.png
# p04.3 po 15 min
ab click "#t-15" >/dev/null 2>&1; sleep 0.5
A S11 "p04.3 +15 min: partia anulowana (opener)" 'ST()==="p04.3" && T().indexOf("Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano.")>=0 && !!document.querySelector("[data-testid=to-panel]") && !!document.querySelector("#game [role=alert]")'
A S11b "zegar demo przesunięty o 15 min" 'document.getElementById("clock").textContent==="poniedziałek 2026-10-26 10:15"'
shot 22-p04-anulowana-15min.png
role creator
A S12 "p04.3 widok twórcy [ASSUMPTION A-07]" 'ST()==="p04.3" && T().indexOf("Partię anulowano: nie została otwarta w ciągu 15 minut.")>=0'
ab click "[data-testid=to-panel]" >/dev/null 2>&1; sleep 0.4
A S13 "przycisk do panelu głównego, brak Wróć do partii" 'location.hash==="#/home" && T().indexOf("Wróć do partii")<0'

# znajomy z kontem
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role friend
H '#/invite/ABCD-EFGH'
A S14 "s07.3 zalogowany: Dołącz do partii, bez opcji gościa" 'ST()==="s07.3" && T().indexOf("Dołącz do partii")>=0 && T().indexOf("Graj jako gość")<0 && T().indexOf("Rozumiem")<0'
shot 23-s07-zalogowany.png
ab click "#join-game" >/dev/null 2>&1; sleep 0.2
A S15 "przycisk zajęty podczas dołączania" 'document.getElementById("join-game").disabled'
sleep 1
A S16 "znajomy w partii: p04.1 Czekamy, aż Ala_7 otworzy partię" 'ST()==="p04.1" && T().indexOf("Czekamy, aż Ala_7 otworzy partię")>=0 && T().indexOf("Grasz bez konta")<0'
shot 24-p04-czekamy-konto.png
role creator
A S17 "p03.5 twórca: Przeciwnik dołączył (Kuba_P)" 'ST()==="p03.5" && T().indexOf("Kuba_P dołączył do partii.")>=0'
shot 25-p03-przeciwnik-dolaczyl.png
sleep 3.2
A S18 "p03.5 po chwili przejście na p04.2 Partia gotowa" 'ST()==="p04.2" && T().indexOf("Partia gotowa")>=0'
A S19 "p04.2 Partia gotowa: przycisk Przejdź do planszy (zamiast komunikatu o etapie B) i powrót do panelu" 'T().indexOf("Plansza pojawi się w etapie B")<0 && !!document.querySelector("[data-testid=go-board]") && !!document.querySelector("[data-testid=to-panel]")'
shot 26-p04-partia-gotowa.png
role friend
A S20 "obaj widzą Partia gotowa" 'ST()==="p04.2"'
H '#/outside?to=board&from=game'
A S21 "Poza tym prototypem: inna partia z drogą powrotu" 'ST()==="outside" && T().indexOf("Poza tym prototypem")>=0 && T().indexOf("Wróć do partii")>=0'
shot 27-poza-etapem-plansza.png
ab click "[data-testid=outside-back-link]" >/dev/null 2>&1; sleep 0.4
A S22 "powrót do partii" 'location.hash==="#/game" && ST()==="p04.2"'
ab click "[data-testid=to-panel]" >/dev/null 2>&1; sleep 0.4
A S23 "Wróć do panelu głównego z Partia gotowa" 'location.hash==="#/home" && T().indexOf("Panel główny")>=0'
A S23b "panel z partią w toku: Wróć do partii" 'T().indexOf("Wróć do partii")>=0'
# +15 po otwarciu nie anuluje
ab click "#t-15" >/dev/null 2>&1; sleep 0.4
H '#/game'
A S24 "+15 min po otwarciu przez obu: partia nie jest anulowana" 'ST()==="p04.2"'

# twórca otwiera stronę: odpytywanie p04.1 -> p04.2 u znajomego
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role friend
H '#/invite/ABCD-EFGH'
ab click "#join-game" >/dev/null 2>&1; sleep 1.2
ab click "#t-open" >/dev/null 2>&1; sleep 1.6
A S25 "Twórca otwiera stronę: u znajomego p04.1 przechodzi na p04.2 (odpytywanie)" 'ST()==="p04.2"'
ab click "#t-open" >/dev/null 2>&1; sleep 0.3
A S25b "t-open bez zastosowania: komunikat Nie dotyczy" 'document.getElementById("clock-status").textContent.indexOf("Nie dotyczy")===0'

# gość: twórca widzi Gość
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role guest
H '#/invite/ABCD-EFGH'
A S26 "gość bez partii widzi trzy wybory (token jednej partii dopiero po dołączeniu)" 'ST()==="s07.1"'
ab click "#guest-open" >/dev/null 2>&1; sleep 0.2
ab click "#guest-go" >/dev/null 2>&1; sleep 1.2
role creator
A S27 "twórca widzi przeciwnika jako Gość" 'ST()==="p03.5" && T().indexOf("Gość dołączył do partii.")>=0'
ab click "#go-on" >/dev/null 2>&1; sleep 0.4
A S27b "Przejdź do partii natychmiast: p04.2, Przeciwnik: Gość" 'ST()==="p04.2" && T().indexOf("Gość")>=0'

# przeciwnik w trzecim roli: brak dostępu / zaproszenie nieważne
role anon
H '#/invite/ABCD-EFGH'
A S28 "zaproszenie przyjęte przez inną osobę: nieważne (BR-11)" 'ST()==="s07.9"'
H '#/game'
A S28b "niezalogowany na /game: brak dostępu" 'ST()==="p07.2"'

# ---------- override s07 ----------
reset
ab select "#t-invite" participant >/dev/null 2>&1
role anon
H '#/invite/ABCD-EFGH'
A O01 "s07 już uczestnik: przekierowanie do partii" 'location.hash==="#/game" && ST()==="p04.1" && document.getElementById("t-role").value==="friend"'
ab click "#t-15" >/dev/null 2>&1; sleep 0.2
reset
ab select "#t-invite" own >/dev/null 2>&1
role friend
H '#/invite/ABCD-EFGH'
A O02 "s07 własne zaproszenie: przekierowanie do partii twórcy (konto zostaje)" 'location.hash==="#/game" && ST()==="p03.1" && document.getElementById("t-role").value==="friend"'
reset
ab select "#t-invite" other-game >/dev/null 2>&1
role friend
H '#/invite/ABCD-EFGH'
A O03 "s07 ma inną partię: Masz już partię" 'ST()==="s07.6" && T().indexOf("Masz już partię")>=0 && !!document.querySelector("#invite [role=alert]")'
shot 28-s07-masz-partie.png
ab click "[data-testid=to-other-game]" >/dev/null 2>&1; sleep 0.4
A O03b "link do partii: Poza tym etapem z powrotem do zaproszenia" 'ST()==="outside" && T().indexOf("Wróć do zaproszenia")>=0'
ab click "[data-testid=outside-back-link]" >/dev/null 2>&1; sleep 0.4
ab select "#t-invite" waiting-game >/dev/null 2>&1; sleep 0.3
A O04 "s07 ma własną oczekującą partię: Anuluj moją partię i dołącz" 'ST()==="s07.7" && T().indexOf("Anuluj moją partię i dołącz")>=0'
shot 29-s07-oczekujaca.png
ab click "#cancel-join" >/dev/null 2>&1; sleep 1.3
A O04b "po Anuluj moją partię i dołącz: p04.1" 'ST()==="p04.1" && location.hash==="#/game"'
reset
ab select "#t-invite" limit >/dev/null 2>&1
H '#/invite/ABCD-EFGH'
A O05 "s07 limit prób (alert)" 'ST()==="s07.8" && T().indexOf("Zbyt wiele prób — spróbuj za chwilę")>=0 && !!document.querySelector("#invite [role=alert]")'
ab select "#t-invite" invalid >/dev/null 2>&1; sleep 0.3
A O06 "s07 nieważne" 'ST()==="s07.9" && T().indexOf("To zaproszenie jest już nieważne")>=0'
shot 30-s07-niewazne.png

# ---------- p03.9, wygaśnięcie 24 h ----------
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
ab click "#t-24" >/dev/null 2>&1; sleep 0.4
A E01 "p03.9 po +24 h: Zaproszenie wygasło. Utwórz nowe." 'ST()==="p03.9" && T().indexOf("Zaproszenie wygasło. Utwórz nowe.")>=0 && document.getElementById("clock").textContent==="wtorek 2026-10-27 10:00"'
shot 31-p03-wygaslo.png
role friend
H '#/invite/ABCD-EFGH'
A E02 "link po wygaśnięciu: nieważne dla osoby z linkiem" 'ST()==="s07.9"'
role creator
H '#/game'
ab click "#create-new" >/dev/null 2>&1; sleep 1.2
A E03 "Utwórz zaproszenie z p03.9: nowa partia p03.1, ważna do kolejnego dnia" 'ST()==="p03.1" && T().indexOf("Ważne do środa 2026-10-28 10:00")>=0'
ab click "#t-24" >/dev/null 2>&1; sleep 0.2
reset
ab click "#t-24" >/dev/null 2>&1; sleep 0.3
A E04 "+24 h bez partii: komunikat zegara" 'document.getElementById("clock-status").textContent.indexOf("+24 h.")===0'

# ---------- nawigacja ----------
reset
H '#/join'
H '#/xyz'
A N01 "nieznany fragment: komunikat z drogą powrotu" 'ST()==="unknown" && T().indexOf("Nie ma takiego ekranu")>=0 && !!document.querySelector("[data-testid=unknown-back]")'
shot 32-nieznany-fragment.png
ab click "[data-testid=unknown-back]" >/dev/null 2>&1; sleep 0.3
A N02 "powrót z nieznanego do panelu" 'location.hash==="#/home"'
ab back >/dev/null 2>&1; sleep 0.4
A N03 "wstecz: nieznany fragment" 'location.hash==="#/xyz" && ST()==="unknown"'
ab back >/dev/null 2>&1; sleep 0.4
A N04 "wstecz: /join" 'location.hash==="#/join" && ST()==="p02.1"'
ab forward >/dev/null 2>&1; sleep 0.4
A N05 "dalej: nieznany fragment" 'location.hash==="#/xyz"'
ab click "[data-testid=unknown-back]" >/dev/null 2>&1; sleep 0.3
ab click "a[href='#/outside?to=lobby']" >/dev/null 2>&1; sleep 0.4
A N06 "Lobby: Poza tym etapem z powrotem" 'ST()==="outside" && T().indexOf("Poza tym etapem")>=0 && T().indexOf("Wróć do panelu głównego")>=0'
shot 33-poza-etapem-lobby.png

# ---------- Reset ----------
ab click "[data-testid=outside-back-link]" >/dev/null 2>&1; sleep 0.3
ab click "#create" >/dev/null 2>&1; sleep 1.2
ab click "#t-15" >/dev/null 2>&1; sleep 0.2
ab select "#t-create" limit >/dev/null 2>&1
ab check "#t-noclip" >/dev/null 2>&1
ab click "#reset" >/dev/null 2>&1; sleep 0.6
A R01 "Reset: start na panelu, p01.1, czas 10:00, domyślne kontrolki" 'location.hash==="#/home" && ST()==="p01.1" && document.getElementById("clock").textContent==="poniedziałek 2026-10-26 10:00" && document.getElementById("t-create").value==="ok" && !document.getElementById("t-noclip").checked && document.getElementById("t-role").value==="creator"'
A R02 "Reset: brak partii, komunikat reset-status" 'T().indexOf("Wróć do partii")<0 && document.getElementById("reset-status").textContent.indexOf("zresetowana")>=0'
H '#/invite/ABCD-EFGH'
A R03 "Reset: stare zaproszenie nieważne" 'ST()==="s07.9"'

# ---------- szerokości ----------
for W in 320 360; do
  ab set viewport $W 740 >/dev/null 2>&1; sleep 0.3
  reset
  A V$W-1 "$W px: panel bez poziomego przewijania" 'document.documentElement.scrollWidth<=window.innerWidth'
  ab click "#create" >/dev/null 2>&1; sleep 1.2
  A V$W-2 "$W px: p03 bez poziomego przewijania" 'ST()==="p03.1" && document.documentElement.scrollWidth<=window.innerWidth'
  shot 34-p03-${W}px.png
  ab click "#cancel" >/dev/null 2>&1; sleep 0.3
  A V$W-3 "$W px: dialog mieści się w oknie" '(function(){var r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0 && r.right<=window.innerWidth})()'
  shot 35-dialog-${W}px.png
  ab press Escape >/dev/null 2>&1; sleep 0.3
  role anon
  H '#/invite/ABCD-EFGH'
  A V$W-4 "$W px: s07.1 bez poziomego przewijania" 'ST()==="s07.1" && document.documentElement.scrollWidth<=window.innerWidth'
  shot 36-s07-${W}px.png
  role friend
  H '#/join'
  A V$W-5 "$W px: /join bez poziomego przewijania" 'document.documentElement.scrollWidth<=window.innerWidth'
  H '#/invite/ABCD-EFGH'
  ab click "#join-game" >/dev/null 2>&1; sleep 1.2
  role creator; sleep 3.2
  A V$W-6 "$W px: p04.2 bez poziomego przewijania" 'ST()==="p04.2" && document.documentElement.scrollWidth<=window.innerWidth'
  shot 37-p04-${W}px.png
done
ab set viewport 1280 800 >/dev/null 2>&1

# ---------- klawiatura: utworzenie i anulowanie bez myszy ----------
reset
ab press Tab >/dev/null 2>&1
ab press Enter >/dev/null 2>&1; sleep 1.2
A K01 "klawiatura: Tab + Enter na Utwórz zaproszenie tworzy partię" 'ST()==="p03.1"'
ab eval 'document.getElementById("cancel").focus(); 1' >/dev/null 2>&1
ab press Enter >/dev/null 2>&1; sleep 0.4
A K02 "klawiatura: Enter na Anuluj zaproszenie otwiera dialog, fokus na Wróć" 'ST()==="p03.6" && AE()==="cancel-back"'
ab press Tab >/dev/null 2>&1
ab press Enter >/dev/null 2>&1; sleep 1.3
A K03 "klawiatura: Tab + Enter na potwierdzeniu anuluje i wraca na panel" 'location.hash==="#/home" && T().indexOf("Zaproszenie zostało anulowane")>=0'


# =====================================================================
# ================= ETAP B: plansza, wynik, poddanie, rewanż ==========
# =====================================================================
ab set viewport 1280 1000 >/dev/null 2>&1
CL='document.querySelector("[data-testid=clock-me] .ct").textContent'
CO='document.querySelector("[data-testid=clock-opp] .ct").textContent'
toboard() { # $1 = black|white (losowanie dla twórcy); kończy na planszy jako twórca (Ala_7)
  reset
  ab select "#t-color" "$1" >/dev/null 2>&1
  ab click "#create" >/dev/null 2>&1; sleep 1.2
  role friend
  H '#/invite/ABCD-EFGH'
  ab click "#join-game" >/dev/null 2>&1; sleep 1.2
  ab click "#t-open" >/dev/null 2>&1; sleep 0.3
  role creator
  ab click "#go-board" >/dev/null 2>&1; sleep 0.5
}
pl() { ab click "#cell-$(( $2 * 15 + $1 ))" >/dev/null 2>&1; sleep 1.0; }   # kolumna wiersz (0-based)
opp() { ab click "#t-oppmove" >/dev/null 2>&1; sleep 0.35; }
gotop() { ev 'window.scrollTo(0,0);1' >/dev/null; }

# ---------- p04.2 -> p05.1: struktura planszy, mysz, ruch ----------
toboard black
A B01 "p04.2 prowadzi na planszę (p05): przycisk Przejdź do planszy zamiast komunikatu o etapie B" 'SH("p05.1") && T().indexOf("Plansza pojawi się w etapie B")<0 && location.hash==="#/game"'
A B02 "plansza: role=grid > row (15) > gridcell (225) > button (225)" 'document.querySelector("[role=grid]").querySelectorAll(":scope > [role=row]").length===15 && document.querySelectorAll("[role=grid] [role=row] > [role=gridcell] > button").length===225'
A B03 "aria-label pola: Kolumna C, rząd 7, puste" 'document.getElementById("cell-92").getAttribute("aria-label")==="Kolumna C, rząd 7, puste"'
A B04 "p05.1: Twój ruch (czarne), Grasz czarnymi, losowanie tylko przy starcie" 'SH("p05.1") && T().indexOf("Twój ruch (czarne)")>=0 && T().indexOf("Grasz czarnymi")>=0 && T().indexOf("Wylosowano: Ty czarne")>=0'
A B05 "zegary 10:00; przeciwnik nad planszą, Ty pod planszą; role=timer" 'document.querySelectorAll("[role=timer]").length===2 && '"$CL"'==="10:00" && '"$CO"'==="10:00" && (function(){var o=document.querySelector("[data-testid=clock-opp]"),b=document.querySelector("[data-testid=board]"),m=document.querySelector("[data-testid=clock-me]");return !!(o.compareDocumentPosition(b)&4) && !!(b.compareDocumentPosition(m)&4)})()'
A B06 "zegar gracza na ruchu: słowo Twój ruch i gruby obrys, bez koloru" 'document.querySelector("[data-testid=clock-me] .run-label").textContent==="Twój ruch" && parseFloat(getComputedStyle(document.querySelector("[data-testid=clock-me]")).borderTopWidth)>=4 && document.querySelector("[data-testid=clock-opp] .run-label").textContent===""'
A B07 "fokus na nagłówku partii, bez obrysu" 'AE()==="game-h" && getComputedStyle(document.activeElement).outlineStyle==="none"'
A B08 "p05.5 mysz: tryb jednego kliknięcia (brak Postaw kamień)" 'SH("p05.5") && !document.getElementById("place")'
A B09 "ostrzeżenie gościa tylko dla gościa (twórca nie widzi)" '!document.querySelector("[data-testid=guest-banner]") && !SH("p05.11")'
gotop; shot 38-p05-twoj-ruch.png
A B10 "p05.6 mysz: jedno kliknięcie wysyła ruch (ruch w drodze, plansza zablokowana)" '(function(){document.getElementById("cell-112").click();return SH("p05.6") && T().indexOf("Wysyłanie ruchu…")>=0 && document.getElementById("cell-113").getAttribute("aria-disabled")==="true"})()'
shot 39-p05-ruch-w-drodze.png
sleep 1.0
A B11 "po ruchu: kamień czarny, ostatni ruch, p05.2 Ruch przeciwnika, losowanie znika" 'SH("p05.2") && document.getElementById("cell-112").getAttribute("aria-label")==="Kolumna H, rząd 8, czarny kamień, ostatni ruch" && T().indexOf("Ruch przeciwnika")>=0 && T().indexOf("Wylosowano")<0 && !SH("p05.6")'
A B12 "zegar przeciwnika oznaczony słowem Ruch przeciwnika, mój nie" 'document.querySelector("[data-testid=clock-opp] .run-label").textContent==="Ruch przeciwnika" && document.querySelector("[data-testid=clock-me] .run-label").textContent===""'
shot 40-p05-ruch-przeciwnika.png
ab click "#cell-100" >/dev/null 2>&1; sleep 0.4
A B13 "p05.8 nie Twoja kolej: kamień nie stanął, krótki komunikat, plansza odświeżona" 'SH("p05.8") && T().indexOf("Teraz ruch przeciwnika. Plansza została odświeżona.")>=0 && document.getElementById("cell-100").getAttribute("aria-label").indexOf("puste")>=0 && SH("p05.2")'
shot 41-p05-nie-twoja-kolej.png
opp
A B14 "ruch przeciwnika (przycisk Test state): biały kamień, p05.1, wynik komunikatu zniknął" 'SH("p05.1") && T().indexOf("Twój ruch (czarne)")>=0 && document.querySelectorAll("[role=grid] button.cell.w").length===1 && !SH("p05.8") && document.querySelector("[data-testid=ctl-status]").textContent.indexOf("Przeciwnik zagrał")===0'
ab click "#cell-112" >/dev/null 2>&1; sleep 0.4
A B15 "p05.9 pole zajęte: To pole jest już zajęte, plansza bez zmian, nadal Twój ruch" 'SH("p05.9") && SH("p05.1") && T().indexOf("To pole jest już zajęte")>=0 && document.querySelectorAll("[role=grid] button.cell.b").length===1'
shot 42-p05-pole-zajete.png
# błąd sieci: ten sam ruch
ab check "#t-moveerr" >/dev/null 2>&1
ab click "#cell-109" >/dev/null 2>&1; sleep 1.1
A B16 "p05.7 błąd sieci: komunikat i Spróbuj ponownie, podgląd ruchu nieudanego" 'SH("p05.7") && !!document.querySelector("#game [role=alert]") && T().indexOf("Nie udało się połączyć z serwerem. Spróbuj ponownie.")>=0 && !!document.getElementById("move-retry") && document.getElementById("cell-109").getAttribute("aria-label").indexOf("ruch nie został wysłany")>=0 && document.querySelectorAll("[role=grid] button.cell.b").length===1'
A B17 "po błędzie fokus na Spróbuj ponownie, pole 109 wciąż puste, Test state odznaczony" 'AE()==="move-retry" && !document.getElementById("t-moveerr").checked'
shot 43-p05-blad-sieci.png
ab click "#move-retry" >/dev/null 2>&1; sleep 1.1
A B18 "Spróbuj ponownie ponawia TEN SAM ruch: kamień na polu 109" 'SH("p05.2") && document.getElementById("cell-109").getAttribute("aria-label").indexOf("czarny kamień")>=0 && !document.getElementById("move-retry") && document.querySelectorAll("[role=grid] button.cell.b").length===2'
# nieaktualny widok
opp
ab check "#t-stale" >/dev/null 2>&1
ab click "#cell-50" >/dev/null 2>&1; sleep 1.1
A B19 "p05.8 nieaktualny widok: cichy powrót z komunikatem, ruch nie zapisany" 'SH("p05.8") && SH("p05.1") && T().indexOf("Plansza była nieaktualna i została odświeżona. Spróbuj ponownie.")>=0 && document.getElementById("cell-50").getAttribute("aria-label").indexOf("puste")>=0 && !document.getElementById("t-stale").checked && !document.querySelector("#game [role=alert]")'
# role switch: widok przeciwnika
role friend; sleep 0.3
A B20 "widok zaproszonego (Kuba_P): Grasz białymi, Twój ruch (białe) po ruchu twórcy" 'T().indexOf("Grasz białymi")>=0 && T().indexOf("Ruch przeciwnika")>=0 && document.querySelector("[data-testid=clock-opp]").innerText.indexOf("Ala_7")>=0'
role creator; sleep 0.3

# ---------- klawiatura planszy ----------
toboard black
ab eval 'document.getElementById("cell-112").focus();1' >/dev/null 2>&1
ab press ArrowRight >/dev/null 2>&1
A K10 "strzałka w prawo przenosi fokus na sąsiednie pole (roving tabindex)" 'AE()==="cell-113" && document.querySelectorAll("[role=grid] button[tabindex=\"0\"]").length===1 && document.getElementById("cell-113").getAttribute("tabindex")==="0"'
ab press ArrowDown >/dev/null 2>&1
A K11 "strzałka w dół: wiersz niżej" 'AE()==="cell-128"'
ab press ArrowLeft >/dev/null 2>&1; ab press ArrowUp >/dev/null 2>&1
A K12 "strzałki w lewo i w górę wracają na pole 112" 'AE()==="cell-112"'
ab eval 'document.getElementById("cell-3").focus();1' >/dev/null 2>&1
ab press ArrowUp >/dev/null 2>&1
A K13 "krawędź: strzałka w górę w rzędzie 1 nie wychodzi poza planszę" 'AE()==="cell-3"'
ab eval 'document.getElementById("cell-112").focus();1' >/dev/null 2>&1
ab press Enter >/dev/null 2>&1; sleep 1.1
A K14 "Enter na polu (mysz): od razu wysyła ruch, fokus zostaje na planszy" 'SH("p05.2") && document.getElementById("cell-112").getAttribute("aria-label").indexOf("czarny kamień")>=0 && AE()==="cell-112"'
# dotyk, dwa kroki
opp
ab select "#t-input" touch >/dev/null 2>&1; sleep 0.3
A T01 "dotyk: Postaw kamień jest widoczny, wyłączony bez zaznaczenia" '!!document.getElementById("place") && document.getElementById("place").disabled && T().indexOf("Dotknij przecięcia, żeby je zaznaczyć.")>=0 && !SH("p05.5")'
ab click "#cell-100" >/dev/null 2>&1; sleep 0.3
A T02 "p05.4 dotyk: pierwsze dotknięcie tylko zaznacza (bez wysyłania), Postaw kamień włączony" 'SH("p05.4") && !SH("p05.6") && document.getElementById("cell-100").getAttribute("aria-label").indexOf("zaznaczone")>=0 && !document.getElementById("place").disabled && T().indexOf("Zaznaczono: Kolumna K, rząd 7")>=0 && document.querySelectorAll("[role=grid] button.cell.b").length===1'
shot 44-p05-dotyk-zaznaczone.png
ab click "#cell-101" >/dev/null 2>&1; sleep 0.3
A T03 "dotyk: dotknięcie innego pola przenosi zaznaczenie" 'document.getElementById("cell-101").getAttribute("aria-label").indexOf("zaznaczone")>=0 && document.getElementById("cell-100").getAttribute("aria-label").indexOf("zaznaczone")<0'
ab click "#place" >/dev/null 2>&1; sleep 1.2
A T04 "Postaw kamień wysyła ruch na zaznaczone przecięcie" 'SH("p05.2") && document.getElementById("cell-101").getAttribute("aria-label").indexOf("czarny kamień")>=0 && !SH("p05.4")'
opp
ab eval 'document.getElementById("cell-130").focus();1' >/dev/null 2>&1
ab press Enter >/dev/null 2>&1; sleep 0.3
A T05 "dotyk + klawiatura: pierwszy Enter zaznacza" 'SH("p05.4") && !SH("p05.6")'
ab press Enter >/dev/null 2>&1; sleep 1.2
A T06 "drugi Enter zatwierdza ruch" 'SH("p05.2") && document.getElementById("cell-130").getAttribute("aria-label").indexOf("czarny kamień")>=0'
ab select "#t-input" mouse >/dev/null 2>&1

# ---------- wygrana czarnymi: prawdziwa piątka ----------
toboard black
pl 5 7; opp; pl 6 7; opp; pl 7 7; opp; pl 8 7; opp
A W20 "cztery w linii: partia trwa" 'SH("p05.1") && document.querySelectorAll("[role=grid] button.cell.win").length===0'
pl 9 7
A W21 "piątka w poziomie: p06.1 Wygrałeś, baner role=status" 'SH("p06.1") && document.querySelector("[data-testid=result-banner]").getAttribute("role")==="status" && document.querySelector("[data-testid=result-banner]").innerText.indexOf("Wygrałeś")===0'
A W22 "linia wygrywająca podświetlona (5 pól z opisem)" 'document.querySelectorAll("[role=grid] button.cell.win").length===5 && document.getElementById("cell-112").getAttribute("aria-label").indexOf("linia wygrywająca")>=0'
A W23 "plansza tylko do odczytu po końcu; brak Poddaj partię i statusu tury" 'document.querySelector("[role=grid]").getAttribute("aria-readonly")==="true" && Array.prototype.every.call(document.querySelectorAll("[role=grid] button"),function(b){return b.disabled}) && !document.getElementById("resign") && !document.querySelector("[data-testid=turn-status]")'
A W24 "fokus na nagłówku Koniec partii; zegary zamrożone (bez Twój ruch)" 'AE()==="game-h" && T().indexOf("Koniec partii")>=0 && document.querySelector("[data-testid=clock-me] .run-label").textContent==="" && document.querySelector("[data-testid=clock-opp] .run-label").textContent===""'
A W25 "p06.10 Rewanż i Wróć do panelu głównego pod wynikiem" 'SH("p06.10") && !!document.getElementById("rematch") && !!document.getElementById("to-panel") && T().indexOf("zagrasz białymi")>=0'
gotop; shot 45-p06-wygrana-linia.png
# pionowo i na ukos
toboard black
pl 2 2; opp; pl 2 3; opp; pl 2 4; opp; pl 2 5; opp; pl 2 6
A W26 "piątka w pionie: wygrana" 'SH("p06.1") && document.querySelectorAll("[role=grid] button.cell.win").length===5'
toboard black
pl 5 2; opp; pl 6 3; opp; pl 7 4; opp; pl 8 5; opp; pl 9 6
A W27 "piątka na przekątnej \\: wygrana" 'SH("p06.1") && document.querySelectorAll("[role=grid] button.cell.win").length===5'
toboard black
pl 14 14; opp; pl 13 13; opp; pl 12 12; opp; pl 11 11; opp; pl 10 10
A W27b "piątka na przekątnej do rogu (14,14)" 'SH("p06.1")'
toboard black
pl 4 0; opp; pl 3 1; opp; pl 2 2; opp; pl 1 3; opp; pl 0 4
A W27c "piątka na przekątnej / (krawędź)" 'SH("p06.1") && document.querySelectorAll("[role=grid] button.cell.win").length===5'
# sześć w linii (swobodne gomoku BR-10)
toboard black
pl 1 7; opp; pl 2 7; opp; pl 3 7; opp; pl 5 7; opp; pl 6 7; opp
A W28 "XX_XX: pięciu jeszcze nie ma (w trakcie)" 'SH("p05.2") || SH("p05.1")'
pl 4 7
A W29 "łączenie dwóch grup: sześć w linii wygrywa (swobodne gomoku)" 'SH("p06.1") && document.querySelectorAll("[role=grid] button.cell.win").length===6'

# ---------- przegrana: przeciwnik układa pięć ----------
toboard black
ab select "#t-script" five >/dev/null 2>&1
pl 0 0; opp; pl 2 0; opp; pl 4 0; opp; pl 6 0; opp; pl 8 0
A L01 "przed ostatnim ruchem przeciwnika: p05.2, brak wyniku" 'SH("p05.2") && T().indexOf("Przegrałeś")<0'
opp
A L02 "przeciwnik daje piątkę: p06.2 Przegrałeś, linia wygrywająca przeciwnika" 'SH("p06.2") && document.querySelector("[data-testid=result-banner]").innerText.indexOf("Przegrałeś")===0 && T().indexOf("Przeciwnik ułożył pięć kamieni w jednej linii.")>=0 && document.querySelectorAll("[role=grid] button.cell.win").length===5'
gotop; shot 46-p06-przegrana.png
# wygrana białymi
toboard white
A W30 "losowanie: Ty białe, p05.2 (czarne zaczynają), Grasz białymi" 'SH("p05.2") && T().indexOf("Wylosowano: Ty białe")>=0 && T().indexOf("Grasz białymi")>=0'
opp; pl 5 7; opp; pl 6 7; opp; pl 7 7; opp; pl 8 7; opp; pl 9 7
A W31 "wygrana białymi prawdziwą piątką: p06.1, kamienie białe" 'SH("p06.1") && document.querySelectorAll("[role=grid] button.cell.win.w").length===5'
A W32 "rewanż po wygranej białymi: zagrasz czarnymi" 'T().indexOf("zagrasz czarnymi")>=0'

# ---------- skróty wyniku ----------
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.4
A SH1 "Pokaż wygraną: p06.1 z linią" 'SH("p06.1") && document.querySelectorAll("[role=grid] button.cell.win").length===5'
toboard black
ab click "#t-showloss" >/dev/null 2>&1; sleep 0.4
A SH2 "Pokaż przegraną: p06.2" 'SH("p06.2")'
toboard black
ab click "#t-showdraw" >/dev/null 2>&1; sleep 0.5
A SH3 "Pokaż remis: p06.4 Remis, pełna plansza bez linii wygrywającej" 'SH("p06.4") && document.querySelector("[data-testid=result-banner]").innerText.indexOf("Remis")===0 && document.querySelectorAll("[role=grid] button.cell.b,[role=grid] button.cell.w").length===225 && document.querySelectorAll("[role=grid] button.cell.win").length===0'
gotop; shot 47-p06-remis.png
ab click "#t-showdraw" >/dev/null 2>&1
A SH4 "skrót bez partii w toku: Nie dotyczy" 'document.querySelector("[data-testid=ctl-status]").textContent.indexOf("Nie dotyczy")===0'
# odświeżenie po końcu (p06.5)
ab click "#t-reload" >/dev/null 2>&1; sleep 0.4
A SH5 "p06.5 odświeżenie po końcu: wynik, bez możliwości ruchu" 'SH("p06.5") && SH("p06.4") && T().indexOf("Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.")>=0 && !document.getElementById("resign")'
shot 48-p06-powrot-po-koncu.png
ab eval 'location.hash="#/home";1' >/dev/null 2>&1; sleep 0.3
H '#/game'
A SH6 "ponowne wejście na /game po końcu: p06.5, wynik bez możliwości ruchu" 'SH("p06.4") && SH("p06.5") && !document.getElementById("resign") && Array.prototype.every.call(document.querySelectorAll("[role=grid] button"),function(b){return b.disabled})'

# ---------- czas: mało czasu, odliczanie, przegrana na czas ----------
toboard black
ev 'window.__lv=0; new MutationObserver(function(){window.__lv++}).observe(document.getElementById("low-live"),{childList:true,characterData:true,subtree:true}); 1' >/dev/null
ab click "#t-j50" >/dev/null 2>&1; sleep 0.3
A C01 "p05.3 mało czasu: zegar 0:50, jaskrawy kolor i grubszy obrys, p05.3 w stanie" 'SH("p05.3") && '"$CL"'==="0:50" && document.querySelector("[data-testid=clock-me]").getAttribute("data-low")==="true" && getComputedStyle(document.querySelector("[data-testid=clock-me] .ct")).color==="rgb(255, 45, 0)" && parseFloat(getComputedStyle(document.querySelector("[data-testid=clock-me]")).borderTopWidth)>=6'
A C02 "mało czasu: bez widocznego tekstu Mało czasu i bez dźwięku (brak audio)" 'T().toLowerCase().indexOf("mało czasu")<0 && document.querySelectorAll("audio").length===0'
A C03 "aria-live ukryty region ogłasza raz: Zostało mniej niż minuta" 'document.getElementById("low-live").getAttribute("aria-live")==="polite" && document.getElementById("low-live").textContent==="Zostało mniej niż minuta" && window.__lv===1'
shot 49-p05-malo-czasu.png
ab click "#t-p60" >/dev/null 2>&1; ab click "#t-j50" >/dev/null 2>&1; sleep 0.3
A C04 "ogłoszenie nie powtarza się po ponownym przejściu progu" 'window.__lv===1 && document.getElementById("low-live").getAttribute("data-count")==="1"'
ab click "#t-p60" >/dev/null 2>&1; ab click "#t-p30" >/dev/null 2>&1
A C05 "+1 min i +30 s: 2:20, koniec stanu mało czasu" ''"$CL"'==="2:20" && !SH("p05.3") && document.querySelector("[data-testid=clock-me]").getAttribute("data-low")==="false"'
ab select "#t-clkwho" opp >/dev/null 2>&1
ab click "#t-j50" >/dev/null 2>&1
A C06 "zegar przeciwnika też może spaść poniżej 60 s (jaskrawy, bez tekstu); Twój stan bez p05.3" ''"$CO"'==="0:50" && document.querySelector("[data-testid=clock-opp]").getAttribute("data-low")==="true" && !SH("p05.3")'
ab select "#t-clkwho" me >/dev/null 2>&1
# odliczanie na żywo
toboard black
ab click "#t-j50" >/dev/null 2>&1
ab select "#t-speed" 30 >/dev/null 2>&1
ab check "#t-count" >/dev/null 2>&1; sleep 0.8
A C07 "odliczanie na żywo (x30): zegar gracza na ruchu maleje poniżej 0:50" 'CS("clock-me")<50'
A C08 "zegar przeciwnika nie biegnie, gdy jest moja tura" ''"$CO"'==="10:00"'
sleep 2.2
A C09 "zegar doszedł do 0:00: p06.3 Przegrałeś — skończył się Twój czas" 'SH("p06.3") && document.querySelector("[data-testid=result-banner]").innerText.indexOf("Przegrałeś — skończył się Twój czas")===0 && '"$CL"'==="0:00"'
gotop; shot 50-p06-przegrana-na-czas.png
ev 'window.__c=CS("clock-me");1' >/dev/null; sleep 1.2
A C10 "po końcu zegary zamrożone: po 1 s bez zmian" 'window.__c===0 && CS("clock-me")===0'
ab uncheck "#t-count" >/dev/null 2>&1
# zegar przeciwnika biegnie w jego turze
toboard black
ab select "#t-speed" 30 >/dev/null 2>&1
pl 5 7
ab check "#t-count" >/dev/null 2>&1; sleep 1.2
A C11 "w turze przeciwnika biegnie jego zegar (mój stoi)" ''"$CO"'!=="10:00" && '"$CL"'==="10:00"'
ab uncheck "#t-count" >/dev/null 2>&1
ab select "#t-clkwho" opp >/dev/null 2>&1
ab click "#t-zero" >/dev/null 2>&1; sleep 0.4
A C12 "Minął czas przeciwnika: p06.1 Wygrałeś — przeciwnikowi skończył się czas, jego zegar 0:00" 'SH("p06.1") && T().indexOf("Wygrałeś — przeciwnikowi skończył się czas")>=0 && '"$CO"'==="0:00"'
ab select "#t-clkwho" me >/dev/null 2>&1
toboard black
ab click "#t-zero" >/dev/null 2>&1; sleep 0.4
A C13 "Minął czas (mój): p06.3, mój zegar pokazuje 0:00" 'SH("p06.3") && '"$CL"'==="0:00"'

# ---------- karta w tle i powrót ----------
toboard black
ab click "#t-bg20" >/dev/null 2>&1; sleep 0.3
A G01 "p05.12 karta w tle: odpytywanie wstrzymane (data-polling, stan, Test state)" 'SH("p05.12") && document.getElementById("game").getAttribute("data-polling")==="paused" && document.getElementById("bg-info").textContent.indexOf("wstrzymane")>=0'
sleep 1.2
A G02 "powrót po 20 s: zegar pomniejszony (9:40), BEZ komunikatu Wróciłeś do partii" '!SH("p05.12") && '"$CL"'==="9:40" && T().indexOf("Wróciłeś do partii")<0 && document.getElementById("game").getAttribute("data-polling")==="active"'
ab click "#t-bg45" >/dev/null 2>&1; sleep 1.5
A G03 "p05.10 powrót po 45 s: Wróciłeś do partii z aktualnym czasem, role=status" 'SH("p05.10") && '"$CL"'==="8:55" && T().indexOf("Wróciłeś do partii. Twój zegar: 8:55.")>=0 && document.querySelector("[data-testid=return-notice]").getAttribute("role")==="status"'
shot 51-p05-wrociles.png
ab click "#cell-112" >/dev/null 2>&1; sleep 1.2
A G04 "komunikat znika po następnym ruchu" '!SH("p05.10") && T().indexOf("Wróciłeś do partii")<0'
ab click "#t-bg45" >/dev/null 2>&1; sleep 8.8
A G05 "komunikat znika sam po kilku sekundach" 'T().indexOf("Wróciłeś do partii")<0'
# czas wyczerpany w nieobecności
toboard black
ab click "#t-j50" >/dev/null 2>&1
ab click "#t-bg45" >/dev/null 2>&1; sleep 1.3
ab click "#t-bg45" >/dev/null 2>&1; sleep 1.5
A G06 "czas wyczerpał się podczas nieobecności: p06.3 bez komunikatu Wróciłeś" 'SH("p06.3") && T().indexOf("Wróciłeś do partii")<0'
# błąd odpytywania w partii (L02)
toboard black
ab check "#t-pollerr" >/dev/null 2>&1; sleep 1.5
A G07 "błąd odpytywania: ponawianie (próba)" 'T().indexOf("Ponawiamy sprawdzanie stanu partii")>=0'
sleep 2.5
A G08 "po 3 nieudanych próbach baner błędu role=alert i Sprawdź teraz" '!!document.querySelector("#play-poll [role=alert]") && T().indexOf("Nie udało się połączyć z serwerem. Spróbuj ponownie.")>=0 && SH("p05.7")'
ab uncheck "#t-pollerr" >/dev/null 2>&1
ab click "#play-poll-retry" >/dev/null 2>&1; sleep 0.4
A G09 "po ustąpieniu błędu baner znika" '!document.querySelector("#play-poll [role=alert]")'

# ---------- poddanie ----------
toboard black
ab click "#resign" >/dev/null 2>&1; sleep 0.4
A R10 "p05.13 dialog poddania: tytuł i treść, fokus na Wróć do gry" 'SH("p05.13") && !!document.querySelector("dialog[open]") && document.getElementById("dlg-h").textContent==="Czy na pewno chcesz się poddać?" && document.querySelector("dialog").innerText.indexOf("Przeciwnik wygra partię.")>=0 && AE()==="resign-back" && document.getElementById("resign-confirm").textContent==="Poddaj partię"'
shot 52-p05-dialog-poddania.png
ab press Escape >/dev/null 2>&1; sleep 0.3
A R11 "Esc zamyka dialog, fokus wraca na Poddaj partię, partia trwa" '!document.querySelector("dialog") && AE()==="resign" && !SH("p05.13") && SH("p05.1")'
ab click "#resign" >/dev/null 2>&1; sleep 0.3
ab click "#resign-back" >/dev/null 2>&1; sleep 0.3
A R12 "Wróć do gry zamyka dialog bez skutku" '!document.querySelector("dialog") && AE()==="resign" && SH("p05.1")'
ab click "#resign" >/dev/null 2>&1; sleep 0.3
ab press Tab >/dev/null 2>&1; ab press Tab >/dev/null 2>&1
A R13 "dialog modalny: fokus nie ucieka do treści strony pod spodem" '!document.activeElement.closest("main,header,aside")'
ab eval 'document.getElementById("resign-back").focus();1' >/dev/null 2>&1
A R14 "p05.14 poddanie w toku: przycisk zajęty" '(function(){document.getElementById("resign-confirm").click();return SH("p05.14") && document.getElementById("resign-confirm").disabled && document.getElementById("resign-confirm").textContent==="Poddawanie…"})()'
shot 53-p05-poddanie-w-toku.png
sleep 1.1
A R15 "p06.9 Ty poddałeś: Przegrałeś, poddałeś partię" 'SH("p06.9") && document.querySelector("[data-testid=result-banner]").innerText.indexOf("Przegrałeś, poddałeś partię")===0 && !document.querySelector("dialog")'
# poddanie w turze przeciwnika + błąd sieci
toboard black
pl 7 7
ab check "#t-resignerr" >/dev/null 2>&1
ab click "#resign" >/dev/null 2>&1; sleep 0.3
ab click "#resign-confirm" >/dev/null 2>&1; sleep 1.2
A R16 "poddanie: błąd sieci w dialogu (role=alert) i Spróbuj ponownie" '!!document.querySelector("dialog #resign-err[role=alert]") && document.getElementById("resign-confirm").textContent==="Spróbuj ponownie" && SH("p05.7") && SH("p05.2")'
shot 54-p05-poddanie-blad.png
ab click "#resign-confirm" >/dev/null 2>&1; sleep 1.2
A R17 "ponowienie poddania: p06.9 (poddanie w turze przeciwnika dozwolone)" 'SH("p06.9")'
toboard black
ab click "#t-oppresign" >/dev/null 2>&1; sleep 0.4
A R18 "p06.8 przeciwnik poddał: Wygrałeś, przeciwnik poddał partię" 'SH("p06.8") && document.querySelector("[data-testid=result-banner]").innerText.indexOf("Wygrałeś, przeciwnik poddał partię")===0'
shot 55-p06-przeciwnik-poddal.png
# poddanie przed pierwszym ruchem
toboard black
ab click "#resign" >/dev/null 2>&1; sleep 0.3
ab click "#resign-confirm" >/dev/null 2>&1; sleep 1.2
A R19 "poddanie przed pierwszym ruchem dozwolone (p06.9)" 'SH("p06.9")'
# klawiatura w dialogu
toboard black
ab eval 'document.getElementById("resign").focus();1' >/dev/null 2>&1
ab press Enter >/dev/null 2>&1; sleep 0.3
A R20 "klawiatura: Enter na Poddaj partię otwiera dialog, fokus na Wróć do gry" 'SH("p05.13") && AE()==="resign-back"'
ab press Escape >/dev/null 2>&1; sleep 0.2

# ---------- rewanż ----------
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.4
ab click "#rematch" >/dev/null 2>&1; sleep 0.4
A M01 "p06.11 rewanż zaproponowany: czekamy (do 5 min), Wycofaj propozycję, fokus" 'SH("p06.11") && T().indexOf("Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).")>=0 && !!document.getElementById("rm-withdraw") && AE()==="rm-withdraw"'
gotop; shot 56-p06-rewanz-zaproponowany.png
ab click "#rm-withdraw" >/dev/null 2>&1; sleep 0.3
A M02 "wycofanie propozycji: wrót do p06.10 z przyciskiem Rewanż" 'SH("p06.10") && !!document.getElementById("rematch") && AE()==="rematch"'
ab click "#rematch" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-accept" >/dev/null 2>&1; sleep 0.5
A M03 "przeciwnik przyjął: NOWA partia, kolory odwrócone (Grasz białymi), p05.2, zegary 10:00" 'SH("p05.2") && T().indexOf("Grasz białymi")>=0 && T().indexOf("Rewanż: kolory zostały zamienione. Grasz białymi.")>=0 && '"$CL"'==="10:00" && '"$CO"'==="10:00" && document.querySelectorAll("[role=grid] button.cell.b,[role=grid] button.cell.w").length===0 && AE()==="game-h"'
gotop; shot 57-p05-po-rewanzu.png
# następny rewanż: ponownie odwrócone
ab click "#t-showloss" >/dev/null 2>&1; sleep 0.4
A M04 "po rewanżu rewanż zaproponować można znowu: zagrasz czarnymi (odwrócone ponownie)" 'SH("p06.10") && T().indexOf("zagrasz czarnymi")>=0'
# propozycja od przeciwnika
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-offer" >/dev/null 2>&1; sleep 0.4
A M05 "p06.12 propozycja od przeciwnika: Przyjmij i Odrzuć" 'SH("p06.12") && T().indexOf("Kuba_P proponuje rewanż. Kolory zostaną zamienione.")>=0 && !!document.getElementById("rm-accept") && !!document.getElementById("rm-decline") && document.getElementById("rm-accept").textContent==="Przyjmij" && document.getElementById("rm-decline").textContent==="Odrzuć"'
gotop; shot 58-p06-propozycja-od-przeciwnika.png
# BR-13 409
ab check "#t-br13" >/dev/null 2>&1
ab click "#rm-accept" >/dev/null 2>&1; sleep 0.4
A M06 "BR-13: przyjęcie kończy się 409 — Masz już partię z linkiem, propozycja trwa (p06.12)" 'SH("p06.12") && !!document.querySelector("[data-testid=rematch-box] [role=alert]") && T().indexOf("Masz już partię")>=0 && !!document.querySelector("[data-testid=to-active]") && T().indexOf("(409)")>=0 && document.querySelectorAll("[role=grid] button.cell.win").length===5'
shot 59-p06-409-masz-partie.png
ab uncheck "#t-br13" >/dev/null 2>&1
ab click "#rm-accept" >/dev/null 2>&1; sleep 0.5
A M07 "po ustąpieniu BR-13 przyjęcie tworzy nową partię z odwróconymi kolorami (p05.2, Grasz białymi)" 'SH("p05.2") && T().indexOf("Grasz białymi")>=0'
# odrzucenie przeze mnie
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-offer" >/dev/null 2>&1; sleep 0.3
ab click "#rm-decline" >/dev/null 2>&1; sleep 0.3
A M08 "Odrzuć (ja): wrót do p06.10, komunikat Odrzuciłeś propozycję" 'SH("p06.10") && T().indexOf("Odrzuciłeś propozycję rewanżu.")>=0 && AE()==="rematch"'
# przeciwnik odrzuca moją propozycję
ab click "#rematch" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-decline" >/dev/null 2>&1; sleep 0.4
A M09 "p06.13 przeciwnik odrzucił: od razu Zaproszenie do rewanżu odrzucone, przycisk do panelu" 'SH("p06.13") && T().indexOf("Zaproszenie do rewanżu odrzucone")>=0 && !!document.getElementById("to-panel") && !document.getElementById("rematch") && T().indexOf("Przeciwnik odrzucił rewanż.")>=0'
gotop; shot 60-p06-odrzucone.png
ab click "#to-panel" >/dev/null 2>&1; sleep 0.4
A M10 "po kliknięciu: panel główny" 'location.hash==="#/home" && T().indexOf("Panel główny")>=0'
# przeciwnik wyszedł
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
ab click "#rematch" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-exit" >/dev/null 2>&1; sleep 0.4
A M11 "przeciwnik wyszedł do panelu: p06.13 od razu, z powodem" 'SH("p06.13") && T().indexOf("Przeciwnik wyszedł do panelu głównego.")>=0'
# wygaśnięcie 5 min
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
ab click "#rematch" >/dev/null 2>&1; sleep 0.3
ab click "#t-5" >/dev/null 2>&1; sleep 0.4
A M12 "p06.14 po 5 min rewanż wygasł; Zaproponuj ponownie" 'SH("p06.14") && T().indexOf("Zaproszenie do rewanżu wygasło (po 5 minutach).")>=0 && !!document.getElementById("rm-again")'
shot 61-p06-rewanz-wygasl.png
ab click "#rm-again" >/dev/null 2>&1; sleep 0.3
A M13 "Zaproponuj ponownie: wrót do p06.10" 'SH("p06.10") && !!document.getElementById("rematch")'
# do 4 min: jeszcze nie wygasa
ab click "#rematch" >/dev/null 2>&1; ab click "#t-5" >/dev/null 2>&1; sleep 0.2
A M13b "ponowna propozycja także wygasa po 5 min" 'SH("p06.14")'
# wyjście do panelu z oczekującą propozycją przeciwnika
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-offer" >/dev/null 2>&1; sleep 0.3
ab click "#to-panel" >/dev/null 2>&1; sleep 0.4
A M14 "Wróć do panelu głównego z propozycją przeciwnika: panel" 'location.hash==="#/home" && T().indexOf("Panel główny")>=0'
H '#/game'
A M14b "po powrocie do wyniku: propozycja przeciwnika zapisana jako odrzucona (p06.10, Odrzuciłeś)" 'SH("p06.10") && T().indexOf("Odrzuciłeś propozycję rewanżu.")>=0'
# propozycja od przeciwnika i wycofanie
toboard black
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-offer" >/dev/null 2>&1; sleep 0.3
ab click "#t-rm-withdraw" >/dev/null 2>&1; sleep 0.3
A M15 "przeciwnik wycofał propozycję: p06.10" 'SH("p06.10") && !!document.getElementById("rematch")'
ab click "#t-rm-accept" >/dev/null 2>&1; sleep 0.2
A M16 "przyjęcie bez propozycji: Nie dotyczy" 'document.querySelector("[data-testid=ctl-status]").textContent.indexOf("Nie dotyczy")===0'

# ---------- gość: ostrzeżenie, wynik 1 h, 404, rewanż z nowym tokenem ----------
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role guest
H '#/invite/ABCD-EFGH'
ab click "#guest-open" >/dev/null 2>&1; sleep 0.2
ab click "#guest-go" >/dev/null 2>&1; sleep 1.2
ab click "#t-open" >/dev/null 2>&1; sleep 0.3
ab click "#go-board" >/dev/null 2>&1; sleep 0.5
A Z01 "p05.11 gość: stałe ostrzeżenie nad partią (nie zmieniaj przeglądarki)" 'SH("p05.11") && !!document.querySelector("[data-testid=guest-banner]") && T().indexOf("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")>=0'
gotop; shot 62-p05-gosc-ostrzezenie.png
role creator; sleep 0.3
A Z02 "twórca widzi przeciwnika jako Gość (BR-24, L14) na zegarze" 'document.querySelector("[data-testid=clock-opp]").innerText.indexOf("Gość")>=0 && !SH("p05.11")'
role guest; sleep 0.3
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.4
A Z03 "p06.6 gość po końcu: wynik do 1 h, token ważny" 'SH("p06.6") && SH("p06.1") && T().indexOf("Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.")>=0 && !document.querySelector("[data-testid=guest-banner]")'
ab click "#rematch" >/dev/null 2>&1; sleep 0.3
A Z04 "rewanż gościa (p06.15): propozycja z informacją o nowym tokenie" 'SH("p06.11") && SH("p06.15") && T().indexOf("Jako gość dostaniesz nowy dostęp do nowej partii w tej przeglądarce.")>=0'
ab click "#t-rm-accept" >/dev/null 2>&1; sleep 0.5
A Z05 "przyjęty rewanż gościa: nowa partia z nowym tokenem w tej samej przeglądarce (p06.15)" 'SH("p06.15") && SH("p05.2") && !!document.querySelector("[data-testid=guest-token-notice]") && T().indexOf("Nowa partia ma nowy dostęp w tej przeglądarce.")>=0 && T().indexOf("Grasz białymi")>=0 && !!document.querySelector("[data-testid=guest-banner]") && document.getElementById("t-role").value==="guest"'
shot 63-p06-rewanz-goscia.png
ab click "#token-ok" >/dev/null 2>&1; sleep 0.3
A Z06 "Rozumiem zamyka komunikat o nowym tokenie" '!document.querySelector("[data-testid=guest-token-notice]") && !SH("p06.15")'
# gość po 1 h: 404
role creator
ab click "#t-showwin" >/dev/null 2>&1; sleep 0.3
role guest
ab click "#t-1h" >/dev/null 2>&1; sleep 0.3
A Z07 "p06.7 gość po 1 h od końca: 404 (jak p07.2)" 'SH("p06.7") && T().indexOf("Ta partia nie istnieje albo nie masz do niej dostępu")>=0 && !!document.querySelector("[data-testid=to-home]")'
shot 64-p06-gosc-po-1h.png
role creator; sleep 0.3
A Z08 "to samo po stronie twórcy: wynik nadal dostępny (konto bez limitu)" 'SH("p06.1") || SH("p06.2")'
# gość w innej przeglądarce: 404, zegar biegnie
reset
ab click "#create" >/dev/null 2>&1; sleep 1.2
role guest
H '#/invite/ABCD-EFGH'
ab click "#guest-open" >/dev/null 2>&1; sleep 0.2
ab click "#guest-go" >/dev/null 2>&1; sleep 1.2
ab click "#t-open" >/dev/null 2>&1; sleep 0.3
ab click "#go-board" >/dev/null 2>&1; sleep 0.5
ab select "#t-speed" 30 >/dev/null 2>&1
ab check "#t-count" >/dev/null 2>&1
ab check "#t-otherbr" >/dev/null 2>&1; sleep 1.2
A Z09 "p07.3 gość w innej przeglądarce: to samo 404, bez ujawniania partii" 'SH("p07.3") && T().indexOf("Ta partia nie istnieje albo nie masz do niej dostępu")>=0 && !document.querySelector("[data-testid=board]")'
A Z10 "zegar partii biegnie mimo 404 (komunikat w Test state)" 'document.getElementById("bg-info").textContent.indexOf("Zegar partii biegnie dalej")>=0'
shot 65-p07-404-gosc-inna-przegladarka.png
ab uncheck "#t-otherbr" >/dev/null 2>&1; sleep 0.3
A Z11 "po powrocie do tej przeglądarki: zegar pomniejszony o czas nieobecności" ''"$CL"'!=="10:00" || '"$CO"'!=="10:00"'
ab uncheck "#t-count" >/dev/null 2>&1

# ---------- p07 ----------
toboard black
ab check "#t-slow" >/dev/null 2>&1
H '#/home'
H '#/game'
A P20 "p07.1 ładowanie: szkielet z role=status i aria-busy" 'SH("p07.1") && !!document.querySelector("[data-testid=skeleton][role=status][aria-busy=true]") && !document.querySelector("[data-testid=board]")'
shot 66-p07-ladowanie.png
sleep 1.8
A P21 "po załadowaniu: plansza (p05)" 'SH("p05.1") && !!document.querySelector("[data-testid=board]")'
ab uncheck "#t-slow" >/dev/null 2>&1
role anon; sleep 0.3
A P22 "p07.2 niezalogowany na /game: brak dostępu, link na stronę główną" 'SH("p07.2") && T().indexOf("Ta partia nie istnieje albo nie masz do niej dostępu")>=0 && !!document.querySelector("[data-testid=to-home]")'
gotop; shot 67-p07-404.png
role creator; sleep 0.3
ab check "#t-db" >/dev/null 2>&1; sleep 0.3
A P23 "p07.4 baza niedostępna: komunikat role=alert i Spróbuj ponownie" 'SH("p07.4") && !!document.querySelector("#game [role=alert]") && T().indexOf("Nie udało się połączyć z serwerem. Spróbuj ponownie.")>=0 && !!document.getElementById("db-retry")'
shot 68-p07-baza-niedostepna.png
ab click "#db-retry" >/dev/null 2>&1; sleep 0.3
A P24 "Spróbuj ponownie przy nadal niedostępnej bazie: ten sam błąd, fokus na przycisku" 'SH("p07.4") && AE()==="db-retry"'
ab uncheck "#t-db" >/dev/null 2>&1; sleep 0.3
ab click "#db-retry" >/dev/null 2>&1; sleep 0.3
A P25 "po przywróceniu bazy: plansza wraca" 'SH("p05.1")'

# ---------- nawigacja (partia) ----------
H '#/home'
A NB1 "panel z partią w toku: Wróć do partii (W toku.)" 'T().indexOf("W toku.")>=0 && T().indexOf("Wróć do partii")>=0'
ab click "[data-testid=back-to-game]" >/dev/null 2>&1; sleep 0.4
A NB2 "Wróć do partii: plansza" 'SH("p05.1") && location.hash==="#/game"'
ab back >/dev/null 2>&1; sleep 0.4
A NB3 "wstecz: panel" 'location.hash==="#/home"'
ab forward >/dev/null 2>&1; sleep 0.4
A NB4 "dalej: partia (stan zachowany, kamienie bez zmian)" 'location.hash==="#/game" && SH("p05.1")'
H '#/home'
ab click "#create" >/dev/null 2>&1; sleep 1.2
A NB5 "panel: Utwórz zaproszenie przy partii w toku: Masz już partię (BR-13)" 'ST()==="p01.3" && T().indexOf("Masz już partię")>=0'
H '#/invite/ABCD-EFGH'
A NB6 "link zaproszenia po rozpoczęciu partii: uczestnik wraca do partii" 'location.hash==="#/game"'
role anon; H '#/invite/ABCD-EFGH'
A NB7 "link zaproszenia po rozpoczęciu partii dla osoby spoza partii: nieważne (BR-01, BR-11)" 'ST()==="s07.9"'
role creator

# ---------- Reset z planszy ----------
toboard black
pl 7 7
ab select "#t-input" touch >/dev/null 2>&1
ab check "#t-count" >/dev/null 2>&1
ab click "#reset" >/dev/null 2>&1; sleep 0.6
A RR1 "Reset z planszy: panel, p01.1, brak partii, domyślne kontrolki etapu B" 'location.hash==="#/home" && ST()==="p01.1" && T().indexOf("Wróć do partii")<0 && document.getElementById("t-input").value==="mouse" && !document.getElementById("t-count").checked && document.getElementById("t-color").value==="black" && document.getElementById("t-speed").value==="10" && document.getElementById("ctl-status").textContent===""'
H '#/game'
A RR2 "po Reset: /game bez dostępu (partia nie istnieje)" 'SH("p07.2")'

# ---------- szerokości etapu B ----------
for W in 320 360; do
  ab set viewport $W 1000 >/dev/null 2>&1; sleep 0.3
  toboard black
  gotop
  A VB$W-1 "$W px: p05 bez poziomego przewijania" 'SH("p05.1") && document.documentElement.scrollWidth<=window.innerWidth'
  A VB$W-2 "$W px: plansza ma co najmniej 320 px szerokości (DS)" 'document.querySelector("[data-testid=board]").getBoundingClientRect().width>=320'
  A VB$W-3 "$W px: pole planszy ma co najmniej 20 px" 'document.getElementById("cell-112").getBoundingClientRect().width>=20'
  shot 70-p05-${W}px.png
  A VB$W-4 "$W px: p05 przycisk Poddaj partię dostępny w widoku strony" 'document.getElementById("resign").getBoundingClientRect().right<=window.innerWidth'
  ab click "#resign" >/dev/null 2>&1; sleep 0.3
  A VB$W-5 "$W px: dialog poddania mieści się w oknie" '(function(){var r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0 && r.right<=window.innerWidth && document.documentElement.scrollWidth<=window.innerWidth})()'
  shot 71-dialog-poddania-${W}px.png
  ab press Escape >/dev/null 2>&1; sleep 0.3
  ab click "#t-j50" >/dev/null 2>&1; sleep 0.3
  A VB$W-6 "$W px: mało czasu bez poziomego przewijania" 'SH("p05.3") && document.documentElement.scrollWidth<=window.innerWidth'
  gotop; shot 72-p05-malo-czasu-${W}px.png
  ab click "#t-showwin" >/dev/null 2>&1; sleep 0.4
  gotop
  A VB$W-7 "$W px: p06 wygrana bez poziomego przewijania" 'SH("p06.1") && document.documentElement.scrollWidth<=window.innerWidth'
  shot 73-p06-wygrana-${W}px.png
  ab click "#rematch" >/dev/null 2>&1; sleep 0.3
  A VB$W-8 "$W px: p06.11 bez poziomego przewijania" 'SH("p06.11") && document.documentElement.scrollWidth<=window.innerWidth'
  ab click "#t-rm-decline" >/dev/null 2>&1; sleep 0.3
  A VB$W-9 "$W px: p06.13 bez poziomego przewijania" 'SH("p06.13") && document.documentElement.scrollWidth<=window.innerWidth'
  ab eval 'document.querySelector("[data-testid=rematch-box]").scrollIntoView();1' >/dev/null 2>&1
  shot 74-p06-odrzucone-${W}px.png
  H '#/game'
  toboard black
  ab click "#t-showloss" >/dev/null 2>&1; sleep 0.3
  ab click "#t-rm-offer" >/dev/null 2>&1; sleep 0.3
  A VB$W-10 "$W px: p06.12 bez poziomego przewijania" 'SH("p06.12") && document.documentElement.scrollWidth<=window.innerWidth'
  ab eval 'document.querySelector("[data-testid=rematch-box]").scrollIntoView();1' >/dev/null 2>&1
  shot 75-p06-propozycja-${W}px.png
  ab click "#rm-decline" >/dev/null 2>&1; ab click "#rematch" >/dev/null 2>&1; sleep 0.3
  ab eval 'document.querySelector("[data-testid=rematch-box]").scrollIntoView();1' >/dev/null 2>&1
  shot 76-p06-zaproponowany-${W}px.png
  toboard black
  ab click "#t-zero" >/dev/null 2>&1; sleep 0.4; gotop
  A VB$W-12 "$W px: p06.3 przegrana na czas bez poziomego przewijania" 'SH("p06.3") && document.documentElement.scrollWidth<=window.innerWidth'
  shot 78-p06-przegrana-na-czas-${W}px.png
  role anon; sleep 0.3; gotop
  A VB$W-11 "$W px: p07 404 bez poziomego przewijania" 'SH("p07.2") && document.documentElement.scrollWidth<=window.innerWidth'
  shot 77-p07-404-${W}px.png
  role creator
done
ab set viewport 1280 800 >/dev/null 2>&1

# ---------- statyka w przeglądarce ----------
A X01 "brak żądań sieciowych poza file://" 'performance.getEntriesByType("resource").every(function(e){return e.name.indexOf("file:")===0})'
A X02 "brak localStorage/sessionStorage/cookie użyte przez prototyp" 'localStorage.length===0 && sessionStorage.length===0 && document.cookie===""'

# ---------- statyka pliku ----------
IDX="$REV/index.html"
if grep -E -q 'fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|WebSocket|sendBeacon|import\(|<script[^>]+src=|<link[^>]+href=|<img|@import|url\(' "$IDX"; then FAIL=$((FAIL+1)); echo "FAIL ST1 | statycznie: znaleziono API sieci/storage/zasób zewnętrzny" | tee -a "$LOG"; else PASS=$((PASS+1)); echo "PASS ST1 | statycznie: brak fetch/XHR/storage/cookie/zewnętrznych skryptów, stylów i obrazów" | tee -a "$LOG"; fi
if grep -o -E 'https?://[^" )]+' "$IDX" | grep -v -E '^https://gomoku\.example' | grep -q .; then FAIL=$((FAIL+1)); echo "FAIL ST2 | statycznie: adres inny niż fikcyjny gomoku.example" | tee -a "$LOG"; else PASS=$((PASS+1)); echo "PASS ST2 | statycznie: jedyny adres https to fikcyjny gomoku.example (tekst, nie ładowany)" | tee -a "$LOG"; fi
if grep -E -q '#[0-9a-fA-F]{3,6}\b' "$IDX" >/dev/null; then :; fi
if grep -q -i -E 'hipotez|oczekiwan(a|e) reakcj|\[SYNTHETIC\]|persona' "$IDX"; then FAIL=$((FAIL+1)); echo "FAIL ST3 | statycznie: treść panelu syntetycznego w interfejsie" | tee -a "$LOG"; else PASS=$((PASS+1)); echo "PASS ST3 | statycznie: brak hipotez i oczekiwanych reakcji w interfejsie" | tee -a "$LOG"; fi
ERR="$(ab errors 2>&1 | tail -3)"; echo "INFO errors: $ERR" >> "$LOG"
