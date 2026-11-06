/**
 * One computation of the bot at a time in this process (spec 2026-11-05-hosted-bot R8): the host has
 * one core, so two searches at once would only make both late. First come, first served; a task that
 * fails releases the gate like one that succeeds.
 */
export class ComputeGate {
  #tail: Promise<unknown> = Promise.resolve();
  #waiting = 0;

  /** Tasks queued or running. */
  get pending(): number {
    return this.#waiting;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.#waiting++;
    const result = this.#tail.then(task).finally(() => {
      this.#waiting--;
    });
    // The next task waits for this one to settle, whatever its outcome.
    this.#tail = result.catch(() => undefined);
    return result;
  }
}

// On `globalThis`, because pages and route handlers hold separate copies of the server modules
// (lesson 2026-10-27-next-layers-duplicate-modules): two module-level gates would let two searches run.
const globalForGate = globalThis as typeof globalThis & { __gomokuBotComputeGate?: ComputeGate };

/** The process-wide gate. */
export function computeGate(): ComputeGate {
  return (globalForGate.__gomokuBotComputeGate ??= new ComputeGate());
}
