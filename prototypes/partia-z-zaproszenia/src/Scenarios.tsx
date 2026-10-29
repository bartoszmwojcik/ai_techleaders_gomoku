import type { ReactNode } from "react";

import { go } from "./chrome";
import {
  advanceClock,
  clockSteps,
  creatorOpens,
  defaultInviteCode,
  openInvite,
  opponentJoins,
  patchScenario,
  prepareDemoInvitation,
  resetSim,
  setClock,
  setRole,
  setupDemo,
  setWidth,
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

const STAGES: readonly (readonly [DemoStage, string])[] = [
  ["waiting", "p03: Ala_7 utworzyła zaproszenie"],
  ["joined", "p03.5: Kuba_P dołączył (widok Ali)"],
  ["opponent-waits", "p04.1: Kuba_P czeka na Alę (widok Kuby)"],
  ["ready", "p04.2: partia gotowa (widok Ali)"],
  ["guest", "p04.4: gość dołączył (widok gościa)"],
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
          <p className="t-hint">Stały „teraz”: poniedziałek 2026-10-26 10:00.</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Act id="sc-plus-15" label="+15 min bez otwarcia" onClick={() => advanceClock(15 * clockSteps.minute)} />
            <Act id="sc-plus-1h" label="+1 h" onClick={() => advanceClock(clockSteps.hour)} />
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
              prepareDemoInvitation();
              openInvite(defaultInviteCode(getSim()));
              go("s07");
            }}
          />
        </Group>
        <Group title="Kopiowanie i odpytywanie (Q08, Q11)">
          <Check id="sc-noclip" label="Schowek niedostępny (p03.3)" flag="clipboardUnavailable" />
          <Check id="sc-noshare" label="„Udostępnij” niedostępne (p03.4)" flag="shareUnavailable" />
          <Check id="sc-pollerr" label="Błąd odpytywania (p03.10)" flag="pollError" />
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
