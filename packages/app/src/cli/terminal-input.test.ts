import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { InterruptedError, createPrompter, type InputStream } from "./terminal-input";

function fakeInput(isTTY: boolean) {
  const emitter = new EventEmitter();
  const input = {
    isTTY,
    setRawMode: vi.fn(),
    setEncoding: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: (event: string, listener: (chunk?: string) => void) => emitter.on(event, listener),
    off: (event: string, listener: (chunk?: string) => void) => emitter.off(event, listener),
  };
  return { input: input as unknown as InputStream & typeof input, emit: (event: string, chunk?: string) => emitter.emit(event, chunk) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("terminal prompter", () => {
  it("hides a secret, handles backspace and restores the terminal", async () => {
    const { input, emit } = fakeInput(true);
    const output = { write: vi.fn() };
    const prompter = createPrompter(input, output);
    expect(prompter.interactive).toBe(true);

    const answer = prompter.ask("Hasło: ", { secret: true });
    emit("data", "abcx\u007f");
    emit("data", "d\r");

    await expect(answer).resolves.toBe("abcd");
    expect(output.write.mock.calls.map(([text]) => text)).toEqual(["Hasło: ", "\n"]);
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(input.pause).toHaveBeenCalled();
  });

  it("echoes a visible answer and ignores backspace on an empty value", async () => {
    const { input, emit } = fakeInput(true);
    const output = { write: vi.fn() };
    const answer = createPrompter(input, output).ask("Nazwa: ");
    emit("data", "\bzł");
    emit("data", "\n");
    await expect(answer).resolves.toBe("zł");
    expect(output.write.mock.calls.map(([text]) => text)).toEqual(["Nazwa: ", "z", "ł", "\n"]);
  });

  it("deletes a whole surrogate pair with one backspace", async () => {
    const { input, emit } = fakeInput(true);
    const answer = createPrompter(input, { write: vi.fn() }).ask("x", { secret: true });
    emit("data", "a😀\u007f\r");
    await expect(answer).resolves.toBe("a");
  });

  it("rejects on Ctrl+C and resolves undefined on Ctrl+D at an empty line", async () => {
    const first = fakeInput(true);
    const interrupted = createPrompter(first.input, { write: vi.fn() }).ask("x", { secret: true });
    first.emit("data", "ab\u0003");
    await expect(interrupted).rejects.toBeInstanceOf(InterruptedError);
    expect(first.input.setRawMode).toHaveBeenLastCalledWith(false);

    const second = fakeInput(true);
    const ended = createPrompter(second.input, { write: vi.fn() }).ask("x");
    second.emit("data", "\u0004");
    await expect(ended).resolves.toBeUndefined();

    const third = fakeInput(true);
    const typed = createPrompter(third.input, { write: vi.fn() }).ask("x");
    third.emit("data", "a\u0004\r");
    await expect(typed).resolves.toBe("a");
  });

  it("works without setRawMode and a missing chunk", async () => {
    const { input, emit } = fakeInput(true);
    delete (input as { setRawMode?: unknown }).setRawMode;
    const answer = createPrompter(input, { write: vi.fn() }).ask("x");
    emit("data");
    emit("data", "ok\r");
    await expect(answer).resolves.toBe("ok");
  });

  it("reads lines from a pipe, across chunks and calls, and ends with undefined", async () => {
    const { input, emit } = fakeInput(false);
    const prompter = createPrompter(input, { write: vi.fn() });
    expect(prompter.interactive).toBe(false);

    const first = prompter.ask("ignored");
    emit("data", "tajne");
    await tick();
    emit("data", "hasło\r\nnastępna\n");
    await expect(first).resolves.toBe("tajnehasło");
    await expect(prompter.ask("ignored")).resolves.toBe("następna");

    const last = prompter.ask("ignored");
    emit("data", "bez końca linii");
    emit("end");
    await expect(last).resolves.toBe("bez końca linii");
    await expect(prompter.ask("ignored")).resolves.toBeUndefined();
  });

  it("tolerates a pipe event without data", async () => {
    const { input, emit } = fakeInput(false);
    const prompter = createPrompter(input, { write: vi.fn() });
    const answer = prompter.ask("x");
    emit("data");
    emit("data", "a\n");
    await expect(answer).resolves.toBe("a");
  });
});
