import type { ReactNode } from "react";

import { go } from "./chrome";
import {
  advanceClock,
  clockSteps,
  deleteFailures,
  opponentJoinsWaitingGame,
  refreshAccountView,
  resignElsewhere,
  setOpponentDeleted,
  expireSession,
  giveAccountAGame,
  setInvite,
  logout,
  patchScenario,
  resetSim,
  setClock,
  setWidth,
  switchAccount,
  useSim,
  viewer,
  type InviteScenario,
  type Provider,
  type Scenario,
} from "./sim";

// Scenario controls (map section 2, P01–P14). They live in the review bar, apart from the product navigation,
// and are not product features.

function Check({ id, label, flag }: { id: string; label: string; flag: keyof Scenario }) {
  const sim = useSim();
  return (
    <label htmlFor={id}>
      <input id={id} type="checkbox" checked={Boolean(sim.scenario[flag])} onChange={(e) => patchScenario({ [flag]: e.target.checked })} />
      {label}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

const ACCOUNTS = [
  ["A0", "A0 niezalogowany"],
  ["A1", "A1 Ala_7, potwierdzony"],
  ["A2", "A2 Kuba_P, niepotwierdzony"],
  ["A3", "A3 Marek_Z, potwierdzony, aktywna partia"],
  ["A4", "A4 Kuba_P niepotwierdzony + token gościa"],
  ["A5", "A5 Ewa_B, niepotwierdzona (starsza niż 7 dni po przesunięciu zegara)"],
  ["A6", "A6 gość partii bez konta"],
  ["A8", "A8 Ola_W, potwierdzona, oczekująca partia"],
] as const;

/** Which demo account the session currently is (the select follows logins made in the forms too). */
function currentAccount(sim: ReturnType<typeof useSim>): string {
  const account = viewer(sim);
  if (!account) return sim.guestGame ? "A6" : "A0";
  if (account.email === "ala@example.com") return "A1";
  if (account.email === "marek@example.com") return "A3";
  if (account.email === "ewa@example.com") return "A5";
  if (account.email === "ola@example.com") return "A8";
  return sim.guestGame ? "A4" : "A2";
}

export function Scenarios() {
  const sim = useSim();
  const s = sim.scenario;
  return (
    <details className="scenario-bar">
      <summary>Scenariusze (kontrolki prototypu, nie funkcje produktu)</summary>
      <div className="scenario-grid">
        <Group title="Konto demo (P07, P09)">
          <label htmlFor="sc-account">
            Konto
            <select id="sc-account" value={currentAccount(sim)} onChange={(e) => switchAccount(e.target.value)}>
              {ACCOUNTS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <p className="t-hint">Hasło wszystkich kont: drewniana-plansza-2026. Zajęte w rejestracji: marek@example.com, Marek_Z, ala@example.com, ewa@example.com; zastrzeżona nazwa: Admin.</p>
        </Group>
        <Group title="Dostawca poczty (P02, P12)">
          <label htmlFor="sc-provider">
            Wysyłka wiadomości
            <select id="sc-provider" value={s.provider} onChange={(e) => patchScenario({ provider: e.target.value as Provider })}>
              <option value="ok">Działa</option>
              <option value="fail">Awaria (502)</option>
              <option value="quota">Dzienny limit wyczerpany (503)</option>
              <option value="none">Brak dostawcy (wysyłka nie działa)</option>
            </select>
          </label>
        </Group>
        <Group title="Następne żądanie (P03, P04, P05, P11)">
          <Check id="sc-limit" label="Limit prób (429)" flag="forceLimit" />
          <Check id="sc-server" label="Błąd serwera (500)" flag="forceServerError" />
          <Check id="sc-network" label="Brak sieci" flag="forceNetworkError" />
          <Check id="sc-already" label="Już zalogowany w innej karcie (409)" flag="alreadyAuthenticated" />
          <Check id="sc-db" label="Baza niedostępna (sesja nieczytelna)" flag="dbDown" />
          <Check id="sc-loading" label="Strony `/` i `/account` się ładują (Szkielet)" flag="loadingPages" />
        </Group>
        <Group title="Link i sesja (P01, P07, P10)">
          <label htmlFor="sc-link">
            Link w wiadomości
            <select id="sc-link" value={s.linkOverride} onChange={(e) => patchScenario({ linkOverride: e.target.value as "auto" | "none" })}>
              <option value="auto">Według stanu (ważny, użyty, wygasły)</option>
              <option value="none">Bez tokenu w adresie</option>
            </select>
          </label>
          <Check id="sc-elsewhere" label="E-mail potwierdzony w innej karcie (409 przy „Wyślij ponownie”)" flag="verifiedElsewhere" />
          <Check id="sc-expired" label="Sesja wygasła przy „Wyślij ponownie” (401)" flag="sessionExpiredOnResend" />
          <button type="button" className="btn btn-outline btn-sm" onClick={expireSession}>Wygaś sesję tej przeglądarki</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void logout()}>Wyloguj w innej karcie</button>
        </Group>
        <Group title="Zegar demo (P08)">
          <p className="t-hint">Stały „teraz”: poniedziałek 2026-10-26 10:00.</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => advanceClock(clockSteps.hour)}>+1 h</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => advanceClock(clockSteps.day)}>+24 h (link wygasa)</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => advanceClock(7 * clockSteps.day)}>+7 dni (baner wraca)</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => advanceClock(14 * clockSteps.day)}>+14 dni (kasowanie niepotwierdzonych)</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => advanceClock(31 * clockSteps.day)}>+31 dni (sesja wygasa)</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setClock(0)}>Wróć do 10:00</button>
          </div>
        </Group>
        <Group title="Zaproszenie s07 i partie (P09)">
          <label htmlFor="sc-invite">
            Stan zaproszenia
            <select id="sc-invite" value={sim.invite} onChange={(e) => setInvite(e.target.value as InviteScenario)}>
              <option value="auto">Według sesji (niezalogowany, zalogowany, gość z partią)</option>
              <option value="participant">Już uczestnik (przekierowanie)</option>
              <option value="own">Własne zaproszenie (przekierowanie)</option>
              <option value="other-game">Ma inną partię w toku</option>
              <option value="waiting-game">Ma własną oczekującą partię</option>
              <option value="limit">Limit prób</option>
              <option value="invalid">Nieważne</option>
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={giveAccountAGame}>Rozegraj partię (konto ma partię)</button>
        </Group>
        <Group title="Usunięcie konta (P15–P18, s05.10–s05.20, s08)">
          <p className="t-hint">Hasło do usunięcia: drewniana-plansza-2026. Konta: Ala_7 (A1) bez partii, Marek_Z (A3) partia w toku, Ola_W (A8) oczekująca partia. Licznik złych haseł: {deleteFailures(sim)} z 10.</p>
          <Check id="sc-del-limit" label="Limit prób (429) przy następnym wysłaniu" flag="deleteLimit" />
          <Check id="sc-del-server" label="Błąd serwera (500) przy następnym wysłaniu" flag="deleteServerError" />
          <Check id="sc-del-401" label="Sesja wygasła w trakcie (401) przy następnym wysłaniu" flag="deleteSessionExpired" />
          <p className="t-hint">„Brak sieci” (Następne żądanie) działa też tutaj.</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={resignElsewhere}>Poddaj partię (w innej karcie)</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={refreshAccountView}>Odśwież stronę konta</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={opponentJoinsWaitingGame}>Przeciwnik dołącza do mojej oczekującej partii (strona nieodświeżona)</button>
          </div>
        </Group>
        <Group title="Widok przeciwnika (s08, O2)">
          <label htmlFor="sc-opp-deleted">
            <input id="sc-opp-deleted" type="checkbox" checked={sim.opponentDeleted} onChange={(e) => setOpponentDeleted(e.target.checked)} />
            Przeciwnik usunął konto (po usunięciu konta w s05 włącza się samo)
          </label>
          <Check id="sc-rematch-notice" label="Pokaż komunikat „Rewanż niedostępny” (decyzja właściciela 2026-10-30)" flag="rematchNotice" />
          <Check id="sc-opp-guest" label="Oglądający jest gościem (BR-29)" flag="opponentIsGuest" />
        </Group>
        <Group title="Podgląd (P13)">
          <label htmlFor="sc-width">
            Szerokość ekranu
            <select id="sc-width" value={sim.width} onChange={(e) => setWidth(Number(e.target.value))}>
              <option value={0}>Pełna</option>
              <option value={1440}>1440 px</option>
              <option value={360}>360 px</option>
              <option value={320}>320 px</option>
            </select>
          </label>
        </Group>
        <Group title="Reset (P14)">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetSim();
              go("s01");
            }}
          >
            Reset symulacji
          </button>
        </Group>
      </div>
    </details>
  );
}
