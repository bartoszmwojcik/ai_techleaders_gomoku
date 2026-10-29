import { useSyncExternalStore } from "react";

// Simulated back end of the prototype: accounts, session, invitations, games and the outcomes the scenario
// controls can force. Everything is in memory and fictitious; nothing here talks to a server (map section 3).
// Rules come from .ai/specs/2026-10-24-game-invitations.md (#21): BR-01, BR-11, BR-13, BR-22, BR-26, Q3, Q5,
// Q13, Q18, Q20, Q21.

export const DEMO_PASSWORD = "drewniana-plansza-2026";
/** Fixed "now" of the demo: Monday 2026-10-26 10:00, Europe/Warsaw (CET, +01:00). */
export const NOW_BASE = Date.parse("2026-10-26T10:00:00+01:00");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const INVITATION_TTL = DAY; // Q3
export const READY_DEADLINE = 15 * MINUTE; // Q21
export const CREATE_LIMIT = 10; // Q13: per player per hour
/** The prototype lets the 6th failed code lookup hit the limit (the product allows 20 per 15 min, Q13). */
export const LOOKUP_LIMIT = 5;
export const CODES = ["ABCD-EFGH", "JKMN-PQRS", "TUVW-XYZ2", "3456-789A", "BCDE-FGHJ", "KMNP-QRST"] as const;
export const DEFAULT_CODE = CODES[0];

/** The demo identities of map section 3 (T8, the operator, has no basis in the materials, L10). */
export type RoleCode = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";

export type Account = { email: string; name: string; verified: boolean };

export const ACCOUNTS: Record<string, Account> = {
  "ala@example.com": { email: "ala@example.com", name: "Ala_7", verified: true },
  "kuba@example.com": { email: "kuba@example.com", name: "Kuba_P", verified: false },
  "marek@example.com": { email: "marek@example.com", name: "Marek_Z", verified: true },
  "ewa@example.com": { email: "ewa@example.com", name: "Ewa_B", verified: true },
  "zofia@example.com": { email: "zofia@example.com", name: "Zofia_K", verified: true },
  // Plays against Marek_Z in the seeded game; has no demo role.
  "olek@example.com": { email: "olek@example.com", name: "Olek_R", verified: true },
};

const ROLE_EMAIL: Partial<Record<RoleCode, string>> = {
  T1: "ala@example.com",
  T2: "kuba@example.com",
  T3: "marek@example.com",
  T4: "ewa@example.com",
  T7: "zofia@example.com",
};

export type Opponent = { kind: "account"; email: string } | { kind: "guest" };

export type Game = {
  id: number;
  code: string;
  creator: string;
  opponent: Opponent | null;
  /** Absolute times in ms. */
  createdAt: number;
  expiresAt: number;
  joinedAt: number | null;
  /** The creator's page has shown the game after the opponent joined (`seen_at`, Q20). The joiner has it at once. */
  seenCreator: boolean;
  /** The creator has seen the "Przeciwnik dołączył" step (p03.5). */
  sawJoin: boolean;
  /** The creator cancelled the invitation (L04). */
  cancelled: boolean;
  /** A game with the board open (seeded for T3); the board itself is stage B. */
  playing: boolean;
};

export type Phase = "waiting" | "expired" | "ready" | "autocancelled" | "playing" | "cancelled";

export type CreateOutcome = "auto" | "active" | "waiting" | "limit" | "server" | "network";
export type InviteOverride = "auto" | "limit" | "invalid";

export type Scenario = {
  createOutcome: CreateOutcome;
  /** Failed code lookups hit the limit (p02.3, s07.8). */
  forceLimit: boolean;
  inviteOverride: InviteOverride;
  clipboardUnavailable: boolean;
  shareUnavailable: boolean;
  pollError: boolean;
  /** The opponent joins between opening the cancel dialog and confirming it (Q09). */
  joinBeforeCancel: boolean;
};

export type Sim = {
  /** Time moved forward by scenario controls (ms). */
  clock: number;
  role: RoleCode;
  /** The game the guest browser (T5) holds a token for (BR-22). */
  guestGame: number | null;
  games: Game[];
  /** Timestamps of game creations per account (Q13). */
  creates: Record<string, number[]>;
  failedLookups: number;
  /** The invitation code the invitation page shows. */
  inviteCode: string | null;
  scenario: Scenario;
  /** A place outside the prototype that the player tried to open. */
  outside: { name: string; kind: OutsideKind } | null;
  /** A one-off message for the next page (e.g. after cancelling). */
  notice: { text: string; screen: "p01" | "p03" | "p04" } | null;
  seq: number;
  /** Bumped by Reset so screens drop their local state. */
  epoch: number;
  /** Width of the preview frame in px, 0 = full. */
  width: number;
};

export type OutsideKind = "account" | "board" | "other";

export const defaultScenario = (): Scenario => ({
  createOutcome: "auto",
  forceLimit: false,
  inviteOverride: "auto",
  clipboardUnavailable: false,
  shareUnavailable: false,
  pollError: false,
  joinBeforeCancel: false,
});

const seedGames = (): Game[] => [
  // T3 (Marek_Z) plays: BR-13 refusal on create and join. The board is stage B.
  {
    id: 1,
    code: "BCDE-FGHJ",
    creator: "marek@example.com",
    opponent: { kind: "account", email: "olek@example.com" },
    createdAt: NOW_BASE - 40 * MINUTE,
    expiresAt: NOW_BASE - 40 * MINUTE + INVITATION_TTL,
    joinedAt: NOW_BASE - 35 * MINUTE,
    seenCreator: true,
    sawJoin: true,
    cancelled: false,
    playing: true,
  },
  // T4 (Ewa_B) waits for an opponent (Q18: her own waiting game).
  {
    id: 2,
    code: "KMNP-QRST",
    creator: "ewa@example.com",
    opponent: null,
    createdAt: NOW_BASE - 30 * MINUTE,
    expiresAt: NOW_BASE - 30 * MINUTE + INVITATION_TTL,
    joinedAt: null,
    seenCreator: false,
    sawJoin: false,
    cancelled: false,
    playing: false,
  },
];

const fresh = (): Sim => ({
  clock: 0,
  role: "T1",
  guestGame: null,
  games: seedGames(),
  creates: {},
  failedLookups: 0,
  inviteCode: null,
  scenario: defaultScenario(),
  outside: null,
  notice: null,
  seq: 3,
  epoch: 0,
  width: 0,
});

let state: Sim = fresh();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const set = (patch: Partial<Sim> | ((current: Sim) => Partial<Sim>)) => {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  emit();
};

export function useSim(): Sim {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export const getSim = () => state;
export const nowMs = (sim: Sim = state) => NOW_BASE + sim.clock;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Latency of the simulated server; `?fast` in the address removes it (tests). */
const LATENCY = typeof location !== "undefined" && location.search.includes("fast") ? 0 : 600;

export function formatNow(sim: Sim): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(nowMs(sim));
}

/** "wtorek 27 października, 10:00" */
export function formatValidUntil(ms: number): string {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(ms);
}

// ---- identity ---------------------------------------------------------------------------------------

/** The signed-in account of the chosen demo identity, or null (T5 and T6 have no account). */
export function viewer(sim: Sim): Account | null {
  const email = ROLE_EMAIL[sim.role];
  return email ? (ACCOUNTS[email] ?? null) : null;
}

/** This browser holds a guest token for a game (T5 after joining as a guest, BR-22). */
export const guestToken = (sim: Sim): number | null => (sim.role === "T5" ? sim.guestGame : null);

export const nameOf = (email: string) => ACCOUNTS[email]?.name ?? email;
export const opponentName = (g: Game): string => (g.opponent === null ? "" : g.opponent.kind === "guest" ? "Gość" : nameOf(g.opponent.email));

// ---- games ------------------------------------------------------------------------------------------

export function phaseOf(sim: Sim, g: Game): Phase {
  if (g.cancelled) return "cancelled";
  if (g.opponent === null) return nowMs(sim) >= g.expiresAt ? "expired" : "waiting";
  if (g.playing) return "playing";
  // Q21: nobody has opened the game for 15 minutes, so it is cancelled and never reaches the history.
  if (!g.seenCreator && nowMs(sim) - (g.joinedAt ?? 0) >= READY_DEADLINE) return "autocancelled";
  return "ready";
}

export type Side = "creator" | "opponent";

export function sideOf(sim: Sim, g: Game): Side | null {
  const account = viewer(sim);
  if (account && g.creator === account.email) return "creator";
  if (account && g.opponent?.kind === "account" && g.opponent.email === account.email) return "opponent";
  if (g.opponent?.kind === "guest" && guestToken(sim) === g.id) return "opponent";
  return null;
}

const isLive = (phase: Phase) => phase === "waiting" || phase === "ready" || phase === "playing";

/** The game the viewer holds a place in (BR-13): waiting, ready or playing. */
export function liveGame(sim: Sim): Game | null {
  return [...sim.games].reverse().find((g) => sideOf(sim, g) !== null && isLive(phaseOf(sim, g))) ?? null;
}

/** The newest game the viewer holds a place in, unless the creator cancelled it: it is what `/games/{id}` shows (p03.9, p04.3 included). */
export function accessibleGame(sim: Sim): Game | null {
  const game = [...sim.games].reverse().find((g) => sideOf(sim, g) !== null) ?? null;
  return game && phaseOf(sim, game) !== "cancelled" ? game : null;
}

/** The screen that shows this game to the viewer: p03 (waiting, expired, or the "Przeciwnik dołączył" step), p04 (ready, cancelled for want of an opener, in progress). */
export function screenForGame(sim: Sim, g: Game): "p03" | "p04" {
  const phase = phaseOf(sim, g);
  if (phase === "waiting" || phase === "expired") return "p03";
  if (phase === "ready" && sideOf(sim, g) === "creator" && !g.sawJoin) return "p03";
  return "p04";
}

/** Where the viewer's game page lives, or null when there is nothing the viewer may open (p07.2). */
export function gameRoute(sim: Sim): "p03" | "p04" | null {
  const g = accessibleGame(sim);
  return g ? screenForGame(sim, g) : null;
}

export const findByCode = (sim: Sim, code: string | null): Game | null => {
  if (!code) return null;
  return [...sim.games].reverse().find((g) => g.code === code) ?? null;
};

// ---- invitation page (s07) --------------------------------------------------------------------------

export type InviteView =
  | "visitor" // s07.1 (and s07.2 after "Graj jako gość")
  | "signed-in" // s07.3
  | "participant" // s07.4 (redirect)
  | "own" // s07.5 (redirect)
  | "other-game" // s07.6
  | "waiting-game" // s07.7
  | "limit" // s07.8
  | "invalid"; // s07.9

export function inviteView(sim: Sim): InviteView {
  if (sim.scenario.forceLimit || sim.failedLookups > LOOKUP_LIMIT || sim.scenario.inviteOverride === "limit") return "limit";
  if (sim.scenario.inviteOverride === "invalid") return "invalid";
  const g = findByCode(sim, sim.inviteCode);
  if (g && isLive(phaseOf(sim, g))) {
    const side = sideOf(sim, g);
    if (side === "creator") return "own";
    if (side === "opponent") return "participant";
  }
  if (!g || phaseOf(sim, g) !== "waiting") return "invalid";
  const mine = liveGame(sim);
  if (viewer(sim)) {
    if (!mine) return "signed-in";
    return phaseOf(sim, mine) === "waiting" ? "waiting-game" : "other-game";
  }
  return mine ? "other-game" : "visitor";
}

/** A looked-up code that points to no waiting game counts as a failed lookup (Q13). */
export function openInvite(code: string) {
  const sim = state;
  const g = findByCode(sim, code);
  const valid = g !== null && phaseOf(sim, g) === "waiting";
  const peekedFailure = !valid && !(g && sideOf(sim, g) && isLive(phaseOf(sim, g)));
  set({ inviteCode: code, failedLookups: peekedFailure && sim.failedLookups <= LOOKUP_LIMIT ? sim.failedLookups + 1 : sim.failedLookups });
}

/** The newest waiting invitation of somebody else: what the review bar opens when no link was followed. */
export function foreignInviteCode(sim: Sim): string | null {
  const account = viewer(sim);
  const waiting = [...sim.games].reverse().find((g) => phaseOf(sim, g) === "waiting" && (!account || g.creator !== account.email));
  return waiting?.code ?? null;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export const dashed = (normalized: string) => (normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized);

export type LookupResult = { kind: "short" } | { kind: "limit" } | { kind: "ok"; code: string };

/** `/join`: shape check, then the limit, then the lookup is shown on the invitation page (p02.2, p02.3, p02.4). */
export async function submitCode(raw: string): Promise<LookupResult> {
  const normalized = normalizeCode(raw);
  if (normalized.length !== 8) return { kind: "short" };
  if (state.scenario.forceLimit || state.failedLookups > LOOKUP_LIMIT) return { kind: "limit" };
  await wait(LATENCY); // p02.5
  openInvite(dashed(normalized));
  return { kind: "ok", code: dashed(normalized) };
}

// ---- actions ----------------------------------------------------------------------------------------

export type CreateResult =
  | { kind: "ok"; gameId: number }
  | { kind: "active" }
  | { kind: "waiting"; gameId: number }
  | { kind: "limit"; minutes: number }
  | { kind: "server" }
  | { kind: "network" };

function nextCode(sim: Sim): string {
  const used = new Set(sim.games.map((g) => g.code));
  return CODES.find((code) => !used.has(code)) ?? `Z${String(sim.seq).padStart(3, "0")}-AAAA`.replace("Z", "Q");
}

function addGame(creator: string): Game {
  const sim = state;
  const now = nowMs(sim);
  const game: Game = {
    id: sim.seq,
    code: nextCode(sim),
    creator,
    opponent: null,
    createdAt: now,
    expiresAt: now + INVITATION_TTL,
    joinedAt: null,
    seenCreator: false,
    sawJoin: false,
    cancelled: false,
    playing: false,
  };
  set({ games: [...sim.games, game], seq: sim.seq + 1, creates: { ...sim.creates, [creator]: [...(sim.creates[creator] ?? []), now] } });
  return game;
}

/** "Utwórz zaproszenie" (p01.2 and its outcomes). Order of checks follows #21: limit, then BR-13 (Q4, Q18). */
export async function createGame(): Promise<CreateResult> {
  await wait(LATENCY);
  const sim = state;
  const account = viewer(sim);
  const forced = sim.scenario.createOutcome;
  if (forced === "network") return { kind: "network" };
  if (forced === "server") return { kind: "server" };
  if (!account) return { kind: "server" };
  const recent = (sim.creates[account.email] ?? []).filter((at) => nowMs(sim) - at < HOUR);
  if (forced === "limit" || recent.length >= CREATE_LIMIT) {
    const minutes = recent.length >= CREATE_LIMIT ? Math.max(1, Math.ceil((recent[0]! + HOUR - nowMs(sim)) / MINUTE)) : 23;
    return { kind: "limit", minutes };
  }
  const mine = liveGame(sim);
  if (forced === "active" || (mine && phaseOf(sim, mine) !== "waiting")) return { kind: "active" };
  if (mine) return { kind: "waiting", gameId: mine.id }; // L01
  if (forced === "waiting") return { kind: "waiting", gameId: addGame(account.email).id };
  return { kind: "ok", gameId: addGame(account.email).id };
}

export type AcceptResult = { kind: "ok" } | { kind: "invalid" };

/** "Dołącz do partii", "Rozumiem, graj jako gość", "Anuluj moją partię i dołącz" (Q18). */
export async function acceptInvite(as: "user" | "guest", cancelOwnWaiting = false): Promise<AcceptResult> {
  await wait(LATENCY);
  const sim = state;
  const g = findByCode(sim, sim.inviteCode);
  if (!g || phaseOf(sim, g) !== "waiting") return { kind: "invalid" };
  const account = viewer(sim);
  if (as === "user" && !account) return { kind: "invalid" };
  const now = nowMs(sim);
  const games = sim.games.map((other) => {
    if (cancelOwnWaiting && account && other.creator === account.email && phaseOf(sim, other) === "waiting") return { ...other, cancelled: true };
    if (other.id !== g.id) return other;
    return {
      ...other,
      opponent: (as === "guest" ? { kind: "guest" } : { kind: "account", email: account!.email }) as Opponent,
      joinedAt: now,
      seenCreator: false,
      sawJoin: false,
    };
  });
  // A guest browser is the T5 identity: it now holds the token of this game.
  set(as === "guest" ? { games, role: "T5", guestGame: g.id } : { games });
  return { kind: "ok" };
}

/** The opponent joins a waiting game while the creator watches (scenario control). */
export function opponentJoins(kind: "account" | "guest") {
  const sim = state;
  const g = liveGame(sim);
  if (!g || phaseOf(sim, g) !== "waiting" || sideOf(sim, g) !== "creator") return;
  const email = g.creator === "kuba@example.com" ? "ala@example.com" : "kuba@example.com";
  const opponent: Opponent = kind === "guest" ? { kind: "guest" } : { kind: "account", email };
  set({
    games: sim.games.map((other) => (other.id === g.id ? { ...other, opponent, joinedAt: nowMs(sim), seenCreator: false, sawJoin: false } : other)),
    // The guest browser of this demo is T5; the token belongs to this game.
    ...(kind === "guest" ? { guestGame: g.id } : {}),
  });
}

/** The creator opens the game page (`seen_at`, Q20): the clock may start for both. */
export function creatorOpens(gameId?: number) {
  const sim = state;
  const g = gameId ? sim.games.find((other) => other.id === gameId) : [...sim.games].reverse().find((other) => other.opponent && !other.seenCreator && sideOf(sim, other) !== null);
  if (!g) return;
  set({ games: sim.games.map((other) => (other.id === g.id ? { ...other, seenCreator: true, sawJoin: true } : other)) });
}

export const markJoinSeen = (gameId: number) => set((s) => ({ games: s.games.map((g) => (g.id === gameId ? { ...g, sawJoin: true } : g)) }));

export type CancelResult = { kind: "ok" } | { kind: "too-late" };

/** "Tak, anuluj zaproszenie" (p03.7, p03.8, Q5). Only a waiting game can be cancelled. */
export async function cancelInvitation(gameId: number): Promise<CancelResult> {
  await wait(LATENCY);
  if (state.scenario.joinBeforeCancel) opponentJoinsGame(gameId);
  const sim = state;
  const g = sim.games.find((other) => other.id === gameId);
  if (!g || phaseOf(sim, g) !== "waiting") return { kind: "too-late" };
  set({ games: sim.games.map((other) => (other.id === gameId ? { ...other, cancelled: true } : other)) });
  return { kind: "ok" };
}

function opponentJoinsGame(gameId: number) {
  const sim = state;
  const g = sim.games.find((other) => other.id === gameId);
  if (!g || g.opponent) return;
  const email = g.creator === "kuba@example.com" ? "ala@example.com" : "kuba@example.com";
  set({ games: sim.games.map((other) => (other.id === gameId ? { ...other, opponent: { kind: "account", email }, joinedAt: nowMs(sim), seenCreator: false, sawJoin: false } : other)) });
}

// ---- scenario controls ------------------------------------------------------------------------------

export const setRole = (role: RoleCode) => set({ role });
export const setWidth = (width: number) => set({ width });
export const showOutside = (name: string | null, kind: OutsideKind = "other") => set({ outside: name === null ? null : { name, kind } });
export const setNotice = (notice: Sim["notice"]) => set({ notice });
export const patchScenario = (patch: Partial<Scenario>) => set((s) => ({ scenario: { ...s.scenario, ...patch } }));
export const advanceClock = (ms: number) => set((s) => ({ clock: s.clock + ms }));
export const setClock = (ms: number) => set({ clock: ms });
export const clockSteps = { minute: MINUTE, hour: HOUR, day: DAY };
export const resetSim = () => {
  state = { ...fresh(), epoch: state.epoch + 1 };
  emit();
};

/** Prepares Ala_7's invitation (first free code, ABCD-EFGH in a fresh demo) so the invitation page has something to show. */
export function prepareDemoInvitation(onlyIfNone = false) {
  const sim = state;
  const alas = sim.games.filter((g) => g.creator === "ala@example.com");
  if (onlyIfNone ? alas.length > 0 : alas.some((g) => phaseOf(sim, g) === "waiting")) return;
  const now = nowMs(sim);
  const game: Game = {
    id: sim.seq,
    code: nextCode(sim),
    creator: "ala@example.com",
    opponent: null,
    createdAt: now,
    expiresAt: now + INVITATION_TTL,
    joinedAt: null,
    seenCreator: false,
    sawJoin: false,
    cancelled: false,
    playing: false,
  };
  set({ games: [...sim.games, game], seq: sim.seq + 1 });
}

export type DemoStage = "waiting" | "joined" | "opponent-waits" | "ready" | "guest";

/** Shortcuts for reviewers: rebuilds the simulation at a given point of the flow (prototype control, not a product feature). Returns the screen to show. */
export function setupDemo(stage: DemoStage): "p03" | "p04" {
  state = { ...fresh(), epoch: state.epoch + 1, width: state.width };
  emit();
  set({ role: "T1" });
  const game = addGame("ala@example.com");
  if (stage === "waiting") return "p03";
  opponentJoins(stage === "guest" ? "guest" : "account");
  if (stage === "joined") return "p03";
  if (stage === "ready") creatorOpens(game.id);
  if (stage === "opponent-waits") set({ role: "T2" });
  if (stage === "guest") set({ role: "T5" });
  return "p04";
}
