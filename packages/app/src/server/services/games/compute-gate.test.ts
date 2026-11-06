import { describe, expect, it } from "vitest";

import { ComputeGate, computeGate } from "./compute-gate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ComputeGate (hosted-bot R8)", () => {
  it("runs one task at a time, first come first served", async () => {
    const gate = new ComputeGate();
    const log: string[] = [];
    const first = deferred<string>();
    const a = gate.run(async () => {
      log.push("a:start");
      return first.promise;
    });
    const b = gate.run(async () => {
      log.push("b:start");
      return "b";
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["a:start"]);
    expect(gate.pending).toBe(2);
    first.resolve("a");
    await expect(a).resolves.toBe("a");
    await expect(b).resolves.toBe("b");
    expect(log).toEqual(["a:start", "b:start"]);
    expect(gate.pending).toBe(0);
  });

  it("releases the gate after a failing task", async () => {
    const gate = new ComputeGate();
    const failed = gate.run(async () => {
      throw new Error("boom");
    });
    const next = gate.run(async () => "next");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");
    expect(gate.pending).toBe(0);
  });

  it("is one per process, on globalThis", () => {
    expect(computeGate()).toBe(computeGate());
    expect((globalThis as { __gomokuBotComputeGate?: unknown }).__gomokuBotComputeGate).toBe(computeGate());
  });
});
