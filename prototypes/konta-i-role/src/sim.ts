import { useSyncExternalStore } from "react";

// Simulated back end of the prototype: accounts, session, mailbox and the outcomes the scenario controls
// can force. Everything is in memory and fictitious; nothing here talks to a server (map section 3).

export const DEMO_PASSWORD = "drewniana-plansza-2026";
/** Fixed "now" of the demo: Monday 2026-10-26 10:00, Europe/Warsaw (CET, +01:00). */
export const NOW_BASE = Date.parse("2026-10-26T10:00:00+01:00");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const LINK_TTL = DAY;
export const SESSION_TTL = 30 * DAY;
export const UNCONFIRMED_TTL = 14 * DAY;
export const BANNER_REOPEN = 7 * DAY;

export type Account = {
  email: string;
  name: string;
  password: string;
  verified: boolean;
  /** Offset from NOW_BASE in ms (negative = in the past). */
  createdAt: number;
  activeGame: boolean;
  /** The account has been in at least one game: unconfirmed accounts with a game are never deleted (BR-28). */
  hasGames: boolean;
  /** The account owns a game that waits for an opponent (status `waiting`); account deletion removes it (spec #37, Q6). */
  waitingGame?: boolean;
};

export type Token = { id: number; email: string; issuedAt: number; usedAt: number | null; invalidated: boolean };
export type Mail = { id: number; tokenId: number; to: string; name: string; sentAt: number };

export type InviteScenario = "auto" | "participant" | "own" | "other-game" | "waiting-game" | "limit" | "invalid";
export type Provider = "ok" | "fail" | "quota" | "none";
export type LinkOverride = "auto" | "none";

export type Scenario = {
  provider: Provider;
  forceLimit: boolean;
  forceServerError: boolean;
  forceNetworkError: boolean;
  linkOverride: LinkOverride;
  /** The e-mail was confirmed in another tab: "Wyślij ponownie" answers 409 (s04.9). */
  verifiedElsewhere: boolean;
  /** The session expired while the player was on the page: "Wyślij ponownie" answers 401 (s04.10). */
  sessionExpiredOnResend: boolean;
  /** Another tab already signed the player in: the next form answers 409 ALREADY_AUTHENTICATED (s01.9, s02.12). */
  alreadyAuthenticated: boolean;
  /** The database is down: the session cannot be read, so the page shows the signed-out view (s04.11, s05.8). */
  dbDown: boolean;
  /** Home and account show a skeleton instead of content (s04.12, s05.9). */
  loadingPages: boolean;
  /** The account deletion form answers 429 on the next send (s05.17). */
  deleteLimit: boolean;
  /** The account deletion answers 500 on the next send, with a correct password (s05.18). */
  deleteServerError: boolean;
  /** The session expired while the player was on /account: the next send answers 401 (s05.19). */
  deleteSessionExpired: boolean;
  /** An opponent's rematch offer was pending when the account is deleted (s08.3). */
  rematchPending: boolean;
  /** s08 shows a notice about the unavailable rematch (assumption, see README O2). */
  rematchNotice: boolean;
  /** s08 is viewed by a guest (BR-29) instead of an account. */
  opponentIsGuest: boolean;
};

export type BannerState = "idle" | "sending" | "sent" | "limited" | "failed";
export type BannerOutcome = "none" | "sent" | "limited" | "failed" | "quota" | "already" | "expired";

export type Sim = {
  /** Time moved forward by scenario controls (ms). */
  clock: number;
  accounts: Record<string, Account>;
  session: { email: string; at: number } | null;
  /** A guest of a running game (BR-22), without an account (A6). */
  guestGame: boolean;
  mails: Mail[];
  tokens: Token[];
  /** The token of the link last opened from the mailbox. */
  openedToken: number | null;
  scenario: Scenario;
  regAttempts: number;
  resendCount: number;
  banner: { state: BannerState; outcome: BannerOutcome };
  /** Name of a place outside the prototype that the player tried to open. */
  outside: string | null;
  /** When the player closed the verification banner (null = never). It comes back after 7 days. */
  bannerClosedAt: number | null;
  /** Which state the invitation page shows (map s07); "auto" derives it from the session. */
  invite: InviteScenario;
  /** Where to go after login or verification (G8), already sanitized. */
  next: string | null;
  seq: number;
  /** Bumped by Reset so screens drop their typed values. */
  epoch: number;
  /** A one-off message for the home page, e.g. after a logout the server did not confirm. */
  notice: string | null;
  /** `/?notice=account-deleted`: the home page says the account is gone (s04.14). */
  deletedNotice: boolean;
  /** What /account shows about the games of the player: a snapshot read when the page opens, so it can be stale (s05.12, s05.20). */
  accountView: { active: boolean; waiting: boolean };
  /** Failed password attempts in the 15-minute window of the account deletion (limit 10, spec #37 Q2); the window starts at the first failure. */
  deleteFails: { email: string; count: number; since: number };
  /** The opponent's account (the one in the finished game on s08) was deleted. */
  opponentDeleted: boolean;
  /** Width of the preview frame in px, 0 = full. */
  width: number;
};

const seedAccounts = (): Record<string, Account> => ({
  "ala@example.com": { email: "ala@example.com", name: "Ala_7", password: DEMO_PASSWORD, verified: true, createdAt: -14 * DAY, activeGame: false, hasGames: true },
  "marek@example.com": { email: "marek@example.com", name: "Marek_Z", password: DEMO_PASSWORD, verified: true, createdAt: -30 * DAY, activeGame: true, hasGames: true },
  "ewa@example.com": { email: "ewa@example.com", name: "Ewa_B", password: DEMO_PASSWORD, verified: false, createdAt: -6 * DAY, activeGame: false, hasGames: false },
  "ola@example.com": { email: "ola@example.com", name: "Ola_W", password: DEMO_PASSWORD, verified: true, createdAt: -3 * DAY, activeGame: false, hasGames: true, waitingGame: true },
});

export const defaultScenario = (): Scenario => ({
  provider: "ok",
  forceLimit: false,
  forceServerError: false,
  forceNetworkError: false,
  linkOverride: "auto",
  verifiedElsewhere: false,
  sessionExpiredOnResend: false,
  alreadyAuthenticated: false,
  dbDown: false,
  loadingPages: false,
  deleteLimit: false,
  deleteServerError: false,
  deleteSessionExpired: false,
  rematchPending: false,
  rematchNotice: false,
  opponentIsGuest: false,
});

const fresh = (): Sim => ({
  clock: 0,
  accounts: seedAccounts(),
  session: null,
  guestGame: false,
  mails: [],
  tokens: [],
  openedToken: null,
  scenario: defaultScenario(),
  regAttempts: 0,
  resendCount: 0,
  banner: { state: "idle", outcome: "none" },
  outside: null,
  next: null,
  bannerClosedAt: null,
  invite: "auto",
  seq: 1,
  epoch: 0,
  notice: null,
  deletedNotice: false,
  accountView: { active: false, waiting: false },
  deleteFails: { email: "", count: 0, since: 0 },
  opponentDeleted: false,
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

/** The signed-in account, or null when there is no session or it expired (G5: 30 days). */
export function viewer(sim: Sim): Account | null {
  if (!sim.session || sim.scenario.dbDown) return null;
  if (nowMs(sim) - sim.session.at >= SESSION_TTL) return null;
  // A deleted account takes its sessions with it (cascade), e.g. the 14-day cleanup of an unconfirmed account without games.
  return accountExists(sim, sim.session.email);
}

/** Unconfirmed accounts without any game are deleted after 14 days (BR-28, replaces Q14). */
export function accountExists(sim: Sim, email: string): Account | null {
  const account = sim.accounts[email];
  if (!account) return null;
  if (!account.verified && !account.hasGames && nowMs(sim) - (NOW_BASE + account.createdAt) >= UNCONFIRMED_TTL) return null;
  return account;
}

// ---- validation (registration-spec G3, G4, G6) -----------------------------------------------------

const RESERVED = ["usunietygracz", "admin", "administrator", "moderator", "system", "gomoku", "support"];
export const normalizeName = (name: string) =>
  name.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_-]/g, "");

export type RegisterFields = { email: string; name: string; password: string };
export type RegisterErrors = Partial<Record<keyof RegisterFields, string>>;

export function validateRegister({ email, name, password }: RegisterFields): RegisterErrors {
  const errors: RegisterErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = "Podaj poprawny adres e-mail.";
  if (!/^[A-Za-z0-9_\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]{3,24}$/.test(name)) errors.name = "Nazwa ma 3–24 znaki: litery, cyfry, _ i -.";
  else if (RESERVED.includes(normalizeName(name))) errors.name = "Ta nazwa jest zastrzeżona. Wybierz inną.";
  if (Array.from(password).length < 8) errors.password = "Hasło musi mieć co najmniej 8 znaków.";
  else if (new TextEncoder().encode(password).length > 72) errors.password = "Hasło może mieć najwyżej 72 bajty (emoji zajmują więcej niż jeden).";
  return errors;
}

export type RegisterResult =
  | { kind: "ok" }
  | { kind: "validation"; errors: RegisterErrors }
  | { kind: "conflict-name" }
  | { kind: "conflict-email" }
  | { kind: "limit" }
  | { kind: "server" }
  | { kind: "network" }
  | { kind: "already" };

/** Safe return path (G8): relative, starts with a single slash, no scheme. In the prototype only screen ids count. */
export const safeNext = (value: string | null | undefined) => (value && /^s0[1-8]$/.test(value) ? value : null);

function issueMail(email: string, name: string) {
  const sim = state;
  const token: Token = { id: sim.seq, email, issuedAt: nowMs(sim), usedAt: null, invalidated: false };
  const mail: Mail = { id: sim.seq + 1, tokenId: token.id, to: email, name, sentAt: nowMs(sim) };
  set({
    // A new link invalidates the older ones, but only after a successful send (email-verification Q7).
    tokens: [...sim.tokens.map((t) => (t.email === email ? { ...t, invalidated: true } : t)), token],
    mails: [...sim.mails, mail],
    seq: sim.seq + 2,
  });
}

export async function register(fields: RegisterFields): Promise<RegisterResult> {
  await wait(LATENCY);
  const sim = state;
  const email = fields.email.trim().toLowerCase();
  const name = fields.name.trim();
  set({ regAttempts: sim.regAttempts + 1 });
  if (sim.scenario.forceNetworkError) return { kind: "network" };
  if (sim.scenario.alreadyAuthenticated) return { kind: "already" };
  if (sim.scenario.forceLimit || sim.regAttempts + 1 > 5) return { kind: "limit" };
  if (sim.scenario.forceServerError) return { kind: "server" };
  const errors = validateRegister({ ...fields, email, name });
  if (Object.keys(errors).length) return { kind: "validation", errors };
  if (accountExists(sim, email)) return { kind: "conflict-email" };
  const key = normalizeName(name);
  if (Object.values(sim.accounts).some((a) => accountExists(sim, a.email) && normalizeName(a.name) === key)) return { kind: "conflict-name" };
  const account: Account = { email, name, password: fields.password, verified: false, createdAt: sim.clock, activeGame: false, hasGames: false };
  set({
    accounts: { ...sim.accounts, [email]: account },
    session: { email, at: nowMs(sim) },
    banner: { state: "idle", outcome: "none" },
    resendCount: 0,
  });
  // Account and session exist even when the mail provider fails (email-verification Q6, assumption A-01).
  if (state.scenario.provider === "ok") issueMail(email, name);
  return { kind: "ok" };
}

export type LoginResult =
  | { kind: "ok"; verified: boolean }
  | { kind: "invalid" }
  | { kind: "validation"; errors: { email?: string; password?: string } }
  | { kind: "limit" }
  | { kind: "server" }
  | { kind: "network" }
  | { kind: "already" };

export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  await wait(LATENCY);
  const sim = state;
  const email = emailRaw.trim().toLowerCase();
  if (sim.scenario.forceNetworkError) return { kind: "network" };
  if (sim.scenario.alreadyAuthenticated) return { kind: "already" };
  if (sim.scenario.forceLimit) return { kind: "limit" };
  if (sim.scenario.forceServerError) return { kind: "server" };
  const errors: { email?: string; password?: string } = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Podaj poprawny adres e-mail.";
  if (!password) errors.password = "Wpisz hasło.";
  if (Object.keys(errors).length) return { kind: "validation", errors };
  const account = accountExists(sim, email);
  if (!account || account.password !== password) return { kind: "invalid" };
  set({ session: { email, at: nowMs(sim) }, banner: { state: "idle", outcome: "none" }, resendCount: 0 });
  return { kind: "ok", verified: account.verified };
}

/** The session in this browser always ends; a server error only means the server did not confirm it (login-logout API). */
export async function logout(): Promise<"ok" | "server"> {
  await wait(LATENCY);
  const failed = state.scenario.forceServerError;
  set({
    session: null,
    banner: { state: "idle", outcome: "none" },
    notice: failed ? "Wylogowano w tej przeglądarce, ale serwer nie potwierdził zakończenia sesji." : null,
  });
  return failed ? "server" : "ok";
}

/** "Odśwież stronę" after a 409: the other tab's session (Ala_7) becomes visible here. */
export function adoptOtherTabSession() {
  const sim = state;
  set({ session: { email: "ala@example.com", at: nowMs(sim) }, scenario: { ...sim.scenario, alreadyAuthenticated: false } });
}

export const clearNotice = () => set({ notice: null });
export const expireSession = () => set((s) => (s.session ? { session: { ...s.session, at: nowMs(s) - SESSION_TTL - HOUR } } : {}));
export const setClock = (ms: number) => set({ clock: ms });
export const setWidth = (width: number) => set({ width });

/** Switches the demo account without a form (scenario control): "A0".."A8". */
export function switchAccount(code: string) {
  const sim = state;
  const email = { A1: "ala@example.com", A3: "marek@example.com", A5: "ewa@example.com", A8: "ola@example.com", A2: "kuba@example.com", A4: "kuba@example.com" }[code];
  if (code === "A0" || code === "A6") {
    set({ session: null, guestGame: code === "A6", banner: { state: "idle", outcome: "none" } });
    return;
  }
  if (!email) return;
  let accounts = sim.accounts;
  if (!accounts[email] && (code === "A2" || code === "A4")) {
    accounts = { ...accounts, [email]: { email, name: "Kuba_P", password: DEMO_PASSWORD, verified: false, createdAt: -5 * 60_000, activeGame: false, hasGames: false } };
    set({ accounts });
    issueMail(email, "Kuba_P");
  }
  set({ session: { email, at: nowMs(state) }, guestGame: code === "A4", banner: { state: "idle", outcome: "none" } });
  refreshAccountView();
}

// ---- e-mail confirmation (email-verification) -------------------------------------------------------

export type LinkStatus = "valid" | "used" | "expired" | "none";

export function linkStatus(sim: Sim, tokenId: number | null): LinkStatus {
  if (sim.scenario.linkOverride === "none" || tokenId === null) return "none";
  const token = sim.tokens.find((t) => t.id === tokenId);
  if (!token) return "none";
  if (token.usedAt !== null || token.invalidated) return "used";
  if (nowMs(sim) - token.issuedAt >= LINK_TTL) return "expired";
  return "valid";
}

export type ConfirmResult = { kind: "ok" } | { kind: "invalid" } | { kind: "server" } | { kind: "network" };

export async function confirmEmail(tokenId: number | null): Promise<ConfirmResult> {
  await wait(LATENCY);
  const sim = state;
  if (sim.scenario.forceNetworkError) return { kind: "network" };
  if (sim.scenario.forceServerError) return { kind: "server" };
  if (linkStatus(sim, tokenId) !== "valid") return { kind: "invalid" };
  const token = sim.tokens.find((t) => t.id === tokenId)!;
  const account = sim.accounts[token.email];
  if (!account) return { kind: "invalid" };
  set({
    tokens: sim.tokens.map((t) => (t.id === token.id ? { ...t, usedAt: nowMs(sim) } : t)),
    accounts: { ...sim.accounts, [account.email]: { ...account, verified: true } },
  });
  return { kind: "ok" };
}

export type ResendOutcome = Exclude<BannerOutcome, "none">;

/** One "Wyślij ponownie": 3 per hour per account (email-verification Q4). Returns what the page should show. */
export async function resend(): Promise<ResendOutcome> {
  await wait(LATENCY);
  const sim = state;
  const account = viewer(sim);
  if (sim.scenario.sessionExpiredOnResend || !account) return "expired";
  if (sim.scenario.verifiedElsewhere) return "already";
  if (sim.resendCount >= 3) return "limited";
  set({ resendCount: sim.resendCount + 1 });
  const provider = sim.scenario.provider;
  if (provider === "fail" || provider === "none") return "failed";
  if (provider === "quota") return "quota";
  issueMail(account.email, account.name);
  return "sent";
}

export function setBanner(bannerState: BannerState, outcome: BannerOutcome = "none") {
  set({ banner: { state: bannerState, outcome } });
}

/** The confirmation happened elsewhere: the page learns it after a refresh. */
export function applyVerifiedElsewhere() {
  const sim = state;
  const account = viewer(sim);
  if (!account) return;
  set({
    accounts: { ...sim.accounts, [account.email]: { ...account, verified: true } },
    scenario: { ...sim.scenario, verifiedElsewhere: false },
    banner: { state: "idle", outcome: "none" },
  });
}

export const dismissBanner = () => set((s) => ({ bannerClosedAt: nowMs(s) }));
/** The banner shows unless it was closed less than 7 days ago; a closing time in the future counts as expired. */
export const bannerVisible = (sim: Sim) => sim.bannerClosedAt === null || sim.bannerClosedAt > nowMs(sim) || nowMs(sim) - sim.bannerClosedAt >= BANNER_REOPEN;
export const setInvite = (invite: InviteScenario) => set({ invite });
/** The guest accepted the warning and joined a game (outside the prototype): from now on they cannot log in or register (BR-22, L26). */
export const joinAsGuest = () => set({ guestGame: true });
/** The current account plays a game: an unconfirmed account with a game is never deleted (BR-28). */
export const giveAccountAGame = () => set((s) => {
  const account = viewer(s);
  return account ? { accounts: { ...s.accounts, [account.email]: { ...account, hasGames: true } } } : {};
});
export const openToken = (id: number | null) => set({ openedToken: id });
export const showOutside = (name: string | null) => set({ outside: name });
export const setNext = (next: string | null) => set({ next });
export const patchScenario = (patch: Partial<Scenario>) => set((s) => ({ scenario: { ...s.scenario, ...patch } }));
export const advanceClock = (ms: number) => set((s) => ({ clock: s.clock + ms }));
export const resetSim = () => {
  state = { ...fresh(), epoch: state.epoch + 1 };
  emit();
};
export const clockSteps = { hour: HOUR, day: DAY };

/** The mailbox of the demo: messages sent to the address of the last registered or selected account. */
export const mailboxFor = (sim: Sim) => [...sim.mails].reverse();


// ---- account deletion (spec 2026-10-24-account-deletion.md, E01-S06 #37) ---------------------------------

export const DELETE_LIMIT = 10;
export const DELETE_WINDOW = 15 * 60_000;

/** The page reads the player's games when it opens or is refreshed; later changes stay invisible until then (s05.20). */
export function refreshAccountView() {
  const account = viewer(state);
  set({ accountView: { active: Boolean(account?.activeGame), waiting: Boolean(account?.waitingGame) } });
}

/** Another tab resigned the running game (E02-S05): the account page learns it after a refresh (s05.12). */
export function resignElsewhere() {
  const account = viewer(state);
  if (!account) return;
  set({ accounts: { ...state.accounts, [account.email]: { ...account, activeGame: false } } });
}

/** The opponent joined the waiting game while the account page was open: the page is stale (s05.20). */
export function opponentJoinsWaitingGame() {
  const account = viewer(state);
  if (!account) return;
  set({ accounts: { ...state.accounts, [account.email]: { ...account, waitingGame: false, activeGame: true } } });
}

/** Failed attempts still counted in the window; the window moves with the demo clock. */
export function deleteFailures(sim: Sim): number {
  // The counter is per account (spec: `account-delete:user:{id}`), so it does not follow a switch of the demo account.
  if (sim.deleteFails.email !== viewer(sim)?.email) return 0;
  return nowMs(sim) - sim.deleteFails.since >= DELETE_WINDOW ? 0 : sim.deleteFails.count;
}

export type DeleteResult =
  | { kind: "ok" }
  | { kind: "wrong-password"; attemptsLeft: number }
  | { kind: "limit"; minutes: number }
  | { kind: "active-game" }
  | { kind: "unauthorized" }
  | { kind: "server" }
  | { kind: "network" };

/**
 * POST /api/account/delete. The order follows the spec: session (401), limit (429), password (400), active game (409), delete.
 * A wrong password is the only outcome that uses up an attempt.
 */
export async function deleteAccount(password: string): Promise<DeleteResult> {
  await wait(LATENCY);
  const sim = state;
  if (sim.scenario.forceNetworkError) return { kind: "network" };
  const account = viewer(sim);
  if (sim.scenario.deleteSessionExpired || !account) {
    set({ session: null, scenario: { ...sim.scenario, deleteSessionExpired: false } });
    return { kind: "unauthorized" };
  }
  const fails = deleteFailures(sim);
  if (sim.scenario.deleteLimit || fails >= DELETE_LIMIT) {
    const left = Math.max(1, Math.ceil((sim.deleteFails.since + DELETE_WINDOW - nowMs(sim)) / 60_000));
    return { kind: "limit", minutes: sim.scenario.deleteLimit && fails < DELETE_LIMIT ? 12 : left };
  }
  if (password !== account.password) {
    const count = fails + 1;
    set({ deleteFails: { email: account.email, count, since: fails === 0 ? nowMs(sim) : sim.deleteFails.since } });
    return { kind: "wrong-password", attemptsLeft: DELETE_LIMIT - count };
  }
  if (sim.scenario.deleteServerError) return { kind: "server" };
  if (account.activeGame) {
    set({ accountView: { active: true, waiting: false } });
    return { kind: "active-game" };
  }
  // One transaction: the waiting game goes with the account (Q6), a pending rematch offer is declined (O2), sessions go by cascade.
  const { [account.email]: _gone, ...rest } = sim.accounts;
  set({
    accounts: rest,
    session: null,
    deletedNotice: true,
    notice: null,
    opponentDeleted: true,
    deleteFails: { email: "", count: 0, since: 0 },
    banner: { state: "idle", outcome: "none" },
  });
  return { kind: "ok" };
}

export const clearDeletedNotice = () => set({ deletedNotice: false });

/** Scenario control: the other player of the finished game on s08 has deleted the account (without deleting one here). */
export const setOpponentDeleted = (value: boolean) => set({ opponentDeleted: value });
