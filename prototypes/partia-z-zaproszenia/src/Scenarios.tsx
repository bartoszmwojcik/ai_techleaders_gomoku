import type { ReactNode } from "react";

import { go } from "./chrome";
import {
  addToClock,
  advanceClock,
  backgroundTab,
  clockSteps,
  creatorOpens,
  expireClock,
  jumpClockTo,
  opponentPlays,
  opponentRematch,
  opponentResigns,
  reloadGamePage,
  setEvent,
  showPosition,
  type OpponentRematch,
  openInvite,
  opponentJoins,
  patchScenario,
  prepareDemoInvitation,
  resetSim,
  setClock,
  setRole,
  setupDemo,
  setWidth,
  DEFAULT_CODE,
  getSim,
  useSim,
  type CreateOutcome,
  type DemoStage,
  type InviteOverride,
  type RoleCode,
  type Scenario,
} from "./sim";
import { resetStateIds } from "./stateId";

// Scenario controls (map section 2, Q01–Q12 for stage A). They live in the review bar, apart from the product
// navigation, and are not product features.

function Pick<K extends keyof Scenario>({ id, label, flag, options }: { id: string; label: string; flag: K; options: readonly (readonly [Scenario[K], string])[] }) {
  const sim = useSim();
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} value={String(sim.scenario[flag])} onChange={(e) => patchScenario({ [flag]: options.find(([value]) => String(value) === e.target.value)![0] } as Partial<Scenario>)}>
        {options.map(([value, text]) => <option key={String(value)} value={String(value)}>{text}</option>)}
      </select>
    </label>
  );
}

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

function Act({ id, label, onClick }: { id?: string; label: string; onClick: () => void }) {
  return (
    <button type="button" id={id} className="btn btn-outline btn-sm" onClick={onClick}>
      {label}
    </button>
  );
}

const ROLES: readonly (readonly [RoleCode, string])[] = [
  ["T1", "T1 Ala_7, e-mail potwierdzony, bez partii"],
  ["T2", "T2 Kuba_P, e-mail niepotwierdzony, bez partii"],
  ["T3", "T3 Marek_Z, partia w toku (BR-13)"],
  ["T4", "T4 Ewa_B, własna oczekująca partia (Q18)"],
  ["T5", "T5 gość partii (przeglądarka z tokenem)"],
  ["T6", "T6 niezalogowany"],
  ["T7", "T7 Zofia_K, spoza partii (404)"],
];

const REMATCH_ACTIONS: readonly (readonly [OpponentRematch, string])[] = [
  ["propose", "Przeciwnik proponuje rewanż"],
  ["withdraw", "…wycofuje propozycję"],
  ["accept", "…przyjmuje"],
  ["decline", "…odrzuca"],
  ["leave", "…wychodzi do panelu"],
];

const NA = "Nie dotyczy: brak partii w toku u oglądającego.";

const STAGES: readonly (readonly [DemoStage, string])[] = [
  ["waiting", "p03: Ala_7 utworzyła zaproszenie"],
  ["joined", "p03.5: Kuba_P dołączył (widok Ali)"],
  ["opponent-waits", "p04.1: Kuba_P czeka na Alę (widok Kuby)"],
  ["ready", "p04.2: partia gotowa (widok Ali)"],
  ["guest", "p04.4: gość dołączył (widok gościa)"],
  ["play-black", "p05.1: partia w toku, Twój ruch (Ala_7, czarne)"],
  ["play-white", "p05.2: partia w toku, ruch przeciwnika (Ala_7, białe)"],
  ["play-guest", "p05.11: gość w partii (widok gościa)"],
  ["won", "p06.1: wygrana z linią (Ala_7)"],
  ["lost", "p06.2: przegrana (Ala_7)"],
  ["draw", "p06.4: remis (Ala_7)"],
];

export function Scenarios() {
  const sim = useSim();
  const s = sim.scenario;
  return (
    <details className="scenario-bar">
      <summary>Scenariusze (kontrolki prototypu, nie funkcje produktu)</summary>
      <div className="scenario-grid">
        <Group title="Konto demo (Q01)">
          <label htmlFor="sc-account">
            Kto ogląda
            <select id="sc-account" value={sim.role} onChange={(e) => setRole(e.target.value as RoleCode)}>
              {ROLES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <p className="t-hint">Hasło wszystkich kont: drewniana-plansza-2026. Zmiana konta niczego nie przenosi: stan partii jest wspólny dla wszystkich.</p>
        </Group>
        <Group title="Skróty do stanów (Q02)">
          <label htmlFor="sc-stage">
            Odbuduj symulację do punktu
            <select id="sc-stage" defaultValue="" onChange={(e) => {
              const stage = e.target.value as DemoStage;
              if (!stage) return;
              resetStateIds();
              go(setupDemo(stage));
              e.target.value = "";
            }}>
              <option value="">Wybierz…</option>
              {STAGES.map(([stage, label]) => <option key={stage} value={stage}>{label}</option>)}
            </select>
          </label>
          <p className="t-hint">Skrót czyści symulację i buduje partię Ala_7.</p>
        </Group>
        <Group title="Przeciwnik i anulowanie (Q02, Q09)">
          <Act id="sc-join-account" label="Przeciwnik dołącza z kontem" onClick={() => opponentJoins("account")} />
          <Act id="sc-join-guest" label="Przeciwnik dołącza jako gość" onClick={() => opponentJoins("guest")} />
          <Act id="sc-opens" label="Twórca otwiera stronę partii" onClick={() => creatorOpens()} />
          <Check id="sc-join-cancel" label="Przeciwnik dołączy, zanim potwierdzę anulowanie" flag="joinBeforeCancel" />
        </Group>
        <Group title="Zegar demo (Q03)">
          <p className="t-hint">Stały „teraz”: poniedziałek 2026-10-26 10:00. Czas demo płynie też dla zegara gracza na ruchu: duże skoki kończą partię przegraną na czas (BR-06, BR-07).</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Act id="sc-plus-15" label="+15 min bez otwarcia" onClick={() => advanceClock(15 * clockSteps.minute)} />
            <Act id="sc-plus-1h" label="+1 h" onClick={() => advanceClock(clockSteps.hour)} />
            <Act id="sc-plus-5" label="+5 min (rewanż wygasa)" onClick={() => advanceClock(5 * clockSteps.minute)} />
            <Act id="sc-plus-24" label="+24 h (zaproszenie wygasa)" onClick={() => advanceClock(clockSteps.day)} />
            <Act id="sc-back" label="Wróć do 10:00" onClick={() => setClock(0)} />
          </div>
        </Group>
        <Group title="Utworzenie partii (Q04)">
          <label htmlFor="sc-create">
            Wynik „Utwórz zaproszenie”
            <select id="sc-create" value={s.createOutcome} onChange={(e) => patchScenario({ createOutcome: e.target.value as CreateOutcome })}>
              <option value="auto">Według konta i partii</option>
              <option value="active">Masz już partię (p01.3)</option>
              <option value="waiting">Masz oczekującą partię (p01.4)</option>
              <option value="limit">Limit utworzeń (p01.5)</option>
              <option value="server">Błąd serwera (p01.6)</option>
              <option value="network">Brak sieci (p01.7)</option>
            </select>
          </label>
        </Group>
        <Group title="Kod i zaproszenie (Q10)">
          <Check id="sc-limit" label="Limit prób sprawdzania kodu (p02.3, s07.8)" flag="forceLimit" />
          <label htmlFor="sc-invite">
            Strona zaproszenia
            <select id="sc-invite" value={s.inviteOverride} onChange={(e) => patchScenario({ inviteOverride: e.target.value as InviteOverride })}>
              <option value="auto">Według partii</option>
              <option value="limit">Limit prób (s07.8)</option>
              <option value="invalid">Nieważne (s07.9)</option>
            </select>
          </label>
          <Act
            id="sc-open-invite"
            label="Otwórz zaproszenie Ala_7"
            onClick={() => {
              // Ala_7's newest invitation in any state (so a used, cancelled or expired link shows its own page); without one, a fresh invitation.
              prepareDemoInvitation(true);
              const alas = getSim().games.filter((g) => g.creator === "ala@example.com");
              openInvite(alas.at(-1)?.code ?? DEFAULT_CODE);
              go("s07");
            }}
          />
        </Group>
        <Group title="Kopiowanie i odpytywanie (Q08, Q11)">
          <Check id="sc-noclip" label="Schowek niedostępny (p03.3)" flag="clipboardUnavailable" />
          <Check id="sc-noshare" label="„Udostępnij” niedostępne (p03.4)" flag="shareUnavailable" />
          <Check id="sc-pollerr" label="Błąd odpytywania (p03.10)" flag="pollError" />
        </Group>
        <Group title="Partia w toku (Q05, Q06)">
          <Pick id="sc-draw" label="Wylosowano" flag="colorDraw" options={[["random", "Losowo"], ["viewer-black", "Ty czarne"], ["viewer-white", "Ty białe"]]} />
          <Pick id="sc-input" label="Urządzenie wejścia" flag="input" options={[["auto", "Wykryj (pointer: coarse)"], ["mouse", "Mysz (jedno kliknięcie)"], ["touch", "Dotyk (dwa kroki)"]]} />
          <Pick id="sc-pattern" label="Ruchy przeciwnika" flag="opponentPattern" options={[["scatter", "Rozproszone (bez piątki)"], ["five", "Piątka w rzędzie"]]} />
          <Act id="sc-opp-move" label="Przeciwnik gra ruch" onClick={() => setEvent(opponentPlays() ? "Przeciwnik zagrał." : "Nie dotyczy: nie jest ruch przeciwnika.")} />
          <Pick id="sc-move" label="Następny ruch" flag="moveOutcome" options={[["ok", "Przyjęty"], ["network", "Błąd sieci (p05.7)"], ["stale", "Nieaktualny widok (p05.8)"], ["not-your-turn", "Nie Twoja kolej (p05.8)"], ["occupied", "Pole zajęte (p05.9)"]]} />
          <Check id="sc-resign-err" label="Następne poddanie: błąd sieci (p05.14)" flag="resignFails" />
          <Check id="sc-poll-err-game" label="Błąd odpytywania działa też w partii (p05.7)" flag="pollError" />
          <Check id="sc-dbdown" label="Baza niedostępna (p07.4)" flag="dbDown" />
          <Check id="sc-slow" label="Wolne ładowanie partii (p07.1)" flag="slowLoad" />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Act id="sc-other-browser" label="Gość w innej przeglądarce (p07.3)" onClick={() => setRole("T6")} />
            <Act id="sc-guest-browser" label="Wróć do przeglądarki gościa" onClick={() => setRole("T5")} />
          </div>
        </Group>
        <Group title="Zegar partii (Q03)">
          <Pick id="sc-clock-target" label="Zegar dotyczy" flag="clockTarget" options={[["mine", "Mojego"], ["theirs", "Przeciwnika"]]} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Act id="sc-clock-30" label="+30 s" onClick={() => addToClock(30_000)} />
            <Act id="sc-clock-60" label="+1 min" onClick={() => addToClock(60_000)} />
            <Act id="sc-clock-50" label="Skocz do 0:50" onClick={() => jumpClockTo(50_000)} />
            <Act id="sc-clock-0" label="Minął czas" onClick={() => expireClock()} />
          </div>
          <Check id="sc-autoclock" label="Odliczaj zegar" flag="autoClock" />
          <Pick id="sc-speed" label="Przyspieszenie" flag="speed" options={[[10, "x10"], [30, "x30"], [1, "x1 (czas rzeczywisty)"]]} />
          <p className="t-hint">Bez „Odliczaj zegar” czas partii stoi; pracują tylko skoki i „+ min” z zegara demo.</p>
        </Group>
        <Group title="Wynik (Q02)">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Act id="sc-show-win" label="Pokaż wygraną" onClick={() => setEvent(showPosition("win") ? "Wygrana: gotowy układ." : NA)} />
            <Act id="sc-show-loss" label="Pokaż przegraną" onClick={() => setEvent(showPosition("loss") ? "Przegrana: gotowy układ." : NA)} />
            <Act id="sc-show-draw" label="Pokaż remis" onClick={() => setEvent(showPosition("draw") ? "Remis: pełna plansza." : NA)} />
            <Act id="sc-almost-full" label="Prawie pełna plansza" onClick={() => setEvent(showPosition("almost-full") ? "Jedno wolne pole: ostatni ruch kończy remisem." : NA)} />
            <Act id="sc-opp-resign" label="Przeciwnik poddał się" onClick={() => setEvent(opponentResigns() ? "Przeciwnik poddał partię." : NA)} />
            <Act id="sc-reload" label="Odśwież stronę partii" onClick={() => reloadGamePage()} />
          </div>
          <p className="t-hint">Skróty nadpisują planszę gotowym układem (A-15). „Odśwież” pokazuje p06.5.</p>
        </Group>
        <Group title="Karta w tle (Q07, Q11)">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Act id="sc-bg-20" label="Karta w tle 20 s" onClick={() => backgroundTab(20)} />
            <Act id="sc-bg-45" label="Karta w tle 45 s" onClick={() => backgroundTab(45)} />
          </div>
          <p className="t-hint">Po 20 s zegar jest mniejszy bez komunikatu, po 45 s pojawia się „Wróciłeś do partii” (próg 30 s, #24 Q2).</p>
        </Group>
        <Group title="Rewanż: przeciwnik (L13, L21, L22)">
          <div className="row" style={{ flexWrap: "wrap" }}>
            {REMATCH_ACTIONS.map(([action, label]) => (
              <Act key={action} id={`sc-rm-${action}`} label={label} onClick={() => opponentRematch(action)} />
            ))}
          </div>
          <Check id="sc-rm-conflict" label="Ktoś z graczy ma inną partię (BR-13, 409)" flag="rematchConflict" />
          <p role="status" className="t-hint" data-testid="sc-event">{sim.event}</p>
        </Group>
        <Group title="Podgląd (Q12)">
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
        <Group title="Reset (Q12)">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetSim();
              resetStateIds();
              go("p01");
            }}
          >
            Reset symulacji
          </button>
        </Group>
      </div>
    </details>
  );
}
