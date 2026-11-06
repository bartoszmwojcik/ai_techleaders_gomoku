import os from "node:os";

import { clampBotMemoryMb } from "@gomoku/core";

/** Where a reading came from: the operator's fixed value, Node's cgroup-aware reading or the OS. */
export type MemorySource = "fixed" | "process" | "os";

export type MemoryReading = { availableMb: number; source: MemorySource };

/**
 * The memory available to the process (spec 2026-11-05-hosted-bot R10), read once when a game with
 * the bot is created and frozen in its seat (BR-57). Injected, so tests and the bench fix it.
 */
export interface ResourceProbe {
  read(): MemoryReading;
}

type ProbeDeps = {
  /** `BOT_FIXED_MEMORY_MB`: when set, nothing is read. */
  fixedMb?: number;
  /** `process.availableMemory` (Node 22: honours the cgroup limit of a container); may be missing. */
  availableMemory?: () => number;
  freemem?: () => number;
};

const MB = 1024 * 1024;

/**
 * `BOT_FIXED_MEMORY_MB` → `process.availableMemory()` → `os.freemem()` (R10). In a container
 * `os.freemem()` reports the host, `process.availableMemory()` the cgroup: checked in the production
 * image with `--memory=2g` (spike E13-S04-T01). The result is whole megabytes that fit `bot_memory_mb`.
 */
export function createResourceProbe({
  fixedMb,
  availableMemory = typeof process.availableMemory === "function" ? () => process.availableMemory() : undefined,
  freemem = () => os.freemem(),
}: ProbeDeps = {}): ResourceProbe {
  return {
    read() {
      if (fixedMb !== undefined) return { availableMb: clampBotMemoryMb(fixedMb), source: "fixed" };
      const fromProcess = availableMemory?.();
      if (fromProcess !== undefined && fromProcess > 0) {
        return { availableMb: clampBotMemoryMb(fromProcess / MB), source: "process" };
      }
      return { availableMb: clampBotMemoryMb(freemem() / MB), source: "os" };
    },
  };
}
