"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePageVisibility } from "@/components/games/use-page-visibility";

/** The pace while a bot is on turn: the shortest useful step next to a pause of 1-2 s (show-mode P8). */
export const DRIVE_BOT_POLL_MS = 750;
/** The pace in every other state (an agent on turn, a show waiting). */
export const DRIVE_IDLE_POLL_MS = 2000;
/** No successful read for longer than this, and the drive counts as stopped (P8). */
export const DRIVE_SILENCE_MS = 5000;
/** This many failed reads in a row, and the drive counts as stopped (P8). */
export const DRIVE_FAILURES_BEFORE_STALL = 3;
/** One read gives up after this long (it counts as a failure). */
export const DRIVE_READ_TIMEOUT_MS = 8000;
/** How often the age of the last successful read is looked at. */
export const DRIVE_TICK_MS = 1000;

/** What one read of the show told the drive. */
export type DriveRead = { ok: true; botOnTurn: boolean; open: boolean } | { ok: false; gone: boolean };

/** Why the drive stopped (P8): the tab is hidden, the server says the bot does not answer, or the server is silent. */
export type DriveStallReason = "hidden" | "bot" | "silent";

export type DriveStatus =
  | { state: "off" }
  | { state: "running" }
  | { state: "slowed"; failures: number }
  | { state: "stalled"; reason: DriveStallReason; silentMs: number };

/** The part of the Screen Wake Lock API the view uses (`navigator.wakeLock`). */
type WakeLockLike = { request(type: "screen"): Promise<{ release(): Promise<void> }> };

type Options = {
  /** The show is still open (active or waiting): only then does the view read and keep the screen on. */
  open: boolean;
  /** A bot was on turn in the state the view started from. */
  botOnTurn: boolean;
  /** `drive.stalled` of the last state. */
  serverStalled: boolean;
  /** Reads the show once and merges the state; the signal ends a read that takes too long. */
  read: (signal: AbortSignal) => Promise<DriveRead>;
  /** A monotonic clock; injected by tests. */
  now?: () => number;
  /** The signal that ends one read; injected by tests (a real timer is out of reach of fake ones, lesson 2026-10-31). */
  timeoutSignal?: (ms: number) => AbortSignal;
  /** `navigator.wakeLock` where the browser has it. */
  wakeLock?: () => WakeLockLike | undefined;
};

const defaultNow = () => performance.now();
const defaultTimeout = (ms: number) => AbortSignal.timeout(ms);
const defaultWakeLock = () => (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;

/**
 * The drive of a show (spec 2026-11-09-show-mode, "Driver"): the administrator's view reads the show again and
 * again, and every read with a bot on turn schedules the bot's move on the server. The next read is planned after
 * the answer to the previous one (lesson 2026-11-02), 750 ms while a bot is on turn and 2 s otherwise. Unlike a
 * spectator, a hidden tab keeps reading (the browser slows its timers, the indicator says so), coming back reads at
 * once, and the screen is kept on where the browser allows it (best effort). The status says when the drive
 * stopped, from three sources: the last successful read is older than 5 s, 3 reads in a row failed, or the
 * server says the bot does not answer (`drive.stalled`).
 */
export function useShowDrive({
  open,
  botOnTurn,
  serverStalled,
  read,
  now = defaultNow,
  timeoutSignal = defaultTimeout,
  wakeLock = defaultWakeLock,
}: Options): { status: DriveStatus; check: () => void; checking: boolean } {
  const [failures, setFailures] = useState(0);
  const [silentMs, setSilentMs] = useState(0);
  const [checking, setChecking] = useState(false);
  const [loop] = useState(() => new DriveLoop(botOnTurn));

  // Before the effect below starts the loop: the latest read and clock, and the setters of this view.
  useEffect(() => loop.configure({ read, now, timeoutSignal, setFailures, setSilentMs, setChecking }), [loop, read, now, timeoutSignal]);

  const check = useCallback(() => void loop.readNow(), [loop]);

  // A hidden tab keeps reading (P8, B4); coming back reads at once instead of waiting for a slowed timer.
  const hidden = usePageVisibility({ onReturn: check });

  useEffect(() => {
    if (!open) return;
    loop.start();
    return () => loop.stop();
  }, [open, loop]);

  useKeepScreenOn(open, wakeLock);

  return { status: statusOf({ open, hidden, serverStalled, failures, silentMs }), check, checking };
}

type LoopHooks = Pick<Options, "read"> &
  Required<Pick<Options, "now" | "timeoutSignal">> & {
    setFailures: (update: (count: number) => number) => void;
    setSilentMs: (ms: number) => void;
    setChecking: (checking: boolean) => void;
  };

/**
 * The reading loop behind `useShowDrive`, outside React's render: one read at a time (a ref-like field set at once,
 * lesson 2026-10-29), the next one planned after the answer (lesson 2026-11-02), a `stopped` flag for a show that is
 * over or gone and for a view that went away.
 */
class DriveLoop {
  hooks!: LoopHooks;

  configure(hooks: LoopHooks) {
    this.hooks = hooks;
  }
  #fast: boolean;
  #lastSuccess = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #tick: ReturnType<typeof setInterval> | undefined;
  #controller: AbortController | null = null;
  #inFlight = false;
  #again = false;
  #stopped = true;

  constructor(botOnTurn: boolean) {
    this.#fast = botOnTurn;
  }

  start() {
    this.#stopped = false;
    this.#lastSuccess = this.hooks.now();
    this.#schedule();
    this.#tick = setInterval(() => this.hooks.setSilentMs(Math.max(0, this.hooks.now() - this.#lastSuccess)), DRIVE_TICK_MS);
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    clearInterval(this.#tick);
    this.#controller?.abort();
  }

  async readNow() {
    if (this.#stopped) return;
    if (this.#inFlight) {
      this.#again = true;
      return;
    }
    clearTimeout(this.#timer);
    this.#inFlight = true;
    this.hooks.setChecking(true);
    do {
      this.#again = false;
      const controller = new AbortController();
      this.#controller = controller;
      this.hooks.timeoutSignal(DRIVE_READ_TIMEOUT_MS).addEventListener("abort", () => controller.abort(), { once: true });
      const result = await this.hooks.read(controller.signal);
      this.#controller = null;
      if (this.#stopped) break;
      if (result.ok) {
        this.#lastSuccess = this.hooks.now();
        this.#fast = result.botOnTurn;
        this.hooks.setFailures(() => 0);
        this.hooks.setSilentMs(0);
        if (!result.open) this.#stopped = true;
      } else if (result.gone) {
        this.#stopped = true;
      } else {
        this.hooks.setFailures((count) => count + 1);
      }
    } while (this.#again && !this.#stopped);
    this.#inFlight = false;
    this.hooks.setChecking(false);
    this.#schedule();
  }

  #schedule() {
    clearTimeout(this.#timer);
    if (this.#stopped) return;
    this.#timer = setTimeout(() => void this.readNow(), this.#fast ? DRIVE_BOT_POLL_MS : DRIVE_IDLE_POLL_MS);
  }
}

function statusOf({
  open,
  hidden,
  serverStalled,
  failures,
  silentMs,
}: {
  open: boolean;
  hidden: boolean;
  serverStalled: boolean;
  failures: number;
  silentMs: number;
}): DriveStatus {
  if (!open) return { state: "off" };
  if (hidden) return { state: "stalled", reason: "hidden", silentMs };
  if (serverStalled) return { state: "stalled", reason: "bot", silentMs };
  if (failures >= DRIVE_FAILURES_BEFORE_STALL || silentMs > DRIVE_SILENCE_MS) return { state: "stalled", reason: "silent", silentMs };
  if (failures > 0) return { state: "slowed", failures };
  return { state: "running" };
}

/**
 * Keeps the screen on while the show is open (P19): `navigator.wakeLock` where it exists, asked again when the tab
 * comes back (the browser drops the lock on a hidden tab). Best effort: no API or a refusal changes nothing else.
 */
function useKeepScreenOn(open: boolean, wakeLock: () => WakeLockLike | undefined) {
  const source = useRef(wakeLock);
  useEffect(() => {
    source.current = wakeLock;
  });

  useEffect(() => {
    if (!open) return;
    let ended = false;
    let held: { release(): Promise<void> } | null = null;
    const request = async () => {
      const lock = source.current();
      if (!lock || document.visibilityState !== "visible") return;
      try {
        const sentinel = await lock.request("screen");
        if (ended) void sentinel.release().catch(() => undefined);
        else held = sentinel;
      } catch {
        // Refused (a power saver, a policy): the drive indicator still tells a sleeping screen.
      }
    };
    const onChange = () => void request();
    void request();
    document.addEventListener("visibilitychange", onChange);
    return () => {
      ended = true;
      document.removeEventListener("visibilitychange", onChange);
      void held?.release().catch(() => undefined);
    };
  }, [open]);
}
