#!/usr/bin/env bash
# Browser walk for game-from-invitation revision-001 (agent-browser, isolated session, file:// URL).
# Usage: evidence/walk.sh   (from anywhere; run `npm`-free, needs node_modules/.bin/agent-browser)
ROOT="$(cd "$(dirname "$0")/../../../../../.." && pwd)"
REV="$ROOT/.ai/prototypes/discovery/game-from-invitation/revision-001"
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
ev 'window.T=function(){return document.querySelector("main > section.active").innerText}; window.ST=function(){return document.getElementById("state-id").textContent}; window.AE=function(){return document.activeElement.id}; true' >/dev/null

# ---------- W: start, p01 ----------
A W01 "start: panel główny, stan p01.1" 'ST()==="p01.1" && T().indexOf("Panel główny")>=0'
A W02 "numer rewizji w pasku i tytule" 'document.querySelector("[data-testid=revision]").textContent==="Rewizja 1" && document.title.indexOf("rewizja 1")>=0'
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
A S19 "p04.2 koniec etapu A: Plansza pojawi się w etapie B + powrót" "$(has 'Plansza pojawi się w etapie B.')"' && !!document.querySelector("[data-testid=to-panel]")'
shot 26-p04-partia-gotowa.png
role friend
A S20 "obaj widzą Partia gotowa" 'ST()==="p04.2"'
ab click "[href='#/outside?to=board&from=game']" >/dev/null 2>&1; sleep 0.4
A S21 "Poza tym etapem: plansza z drogą powrotu" 'ST()==="outside" && T().indexOf("Poza tym etapem")>=0 && T().indexOf("Wróć do partii")>=0'
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

# ---------- statyka w przeglądarce ----------
A X01 "brak żądań sieciowych poza file://" 'performance.getEntriesByType("resource").every(function(e){return e.name.indexOf("file:")===0})'
A X02 "brak localStorage/sessionStorage/cookie użyte przez prototyp" 'localStorage.length===0 && sessionStorage.length===0 && document.cookie===""'
ERR="$(ab errors 2>&1 | tail -3)"; echo "INFO errors: $ERR" >> "$LOG"
