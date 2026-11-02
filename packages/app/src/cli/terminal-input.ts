// Reading operator input for `npm run admin:create` (E08-S01): a hidden password prompt on a
// terminal, plain lines when stdin is a pipe. Streams are injected so every branch is testable.

export type InputStream = {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  setEncoding: (encoding: BufferEncoding) => unknown;
  resume: () => unknown;
  pause: () => unknown;
  on: (event: "data" | "end", listener: (chunk?: string) => void) => unknown;
  off: (event: "data" | "end", listener: (chunk?: string) => void) => unknown;
};
export type OutputStream = { write: (text: string) => unknown };

/** The operator pressed Ctrl+C. */
export class InterruptedError extends Error {
  constructor() {
    super("Przerwano.");
    this.name = "InterruptedError";
  }
}

export type Prompter = {
  readonly interactive: boolean;
  /** One line without its line break; `undefined` at the end of input. `secret` hides the typed characters. */
  ask: (label: string, options?: { secret?: boolean }) => Promise<string | undefined>;
};

const CTRL_C = "\u0003";
const CTRL_D = "\u0004";

/** Terminal: raw mode, characters handled one by one; the secret is never echoed. */
function askOnTerminal(input: InputStream, output: OutputStream, label: string, secret: boolean): Promise<string | undefined> {
  output.write(label);
  input.setRawMode?.(true);
  input.setEncoding("utf8");
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (settle: () => void) => {
      input.off("data", onData);
      input.setRawMode?.(false);
      input.pause();
      output.write("\n");
      settle();
    };
    const onData = (chunk = "") => {
      for (const char of chunk) {
        if (char === CTRL_C) return finish(() => reject(new InterruptedError()));
        if (char === CTRL_D) {
          if (value === "") return finish(() => resolve(undefined));
          continue; // like a shell: Ctrl+D inside a line does nothing
        }
        if (char === "\r" || char === "\n") return finish(() => resolve(value));
        if (char === "\u007f" || char === "\b") {
          const removed = [...value].pop();
          value = value.slice(0, value.length - (removed?.length ?? 0));
          continue;
        }
        value += char;
        if (!secret) output.write(char);
      }
    };
    input.on("data", onData);
  });
}

/** Pipe: lines are buffered across calls, so one stream can answer several questions. */
function createLineQueue(input: InputStream) {
  let buffer = "";
  let ended = false;
  let waiting: (() => void) | undefined;
  input.setEncoding("utf8");
  input.on("data", (chunk = "") => {
    buffer += chunk;
    waiting?.();
  });
  input.on("end", () => {
    ended = true;
    waiting?.();
  });
  input.resume();
  return async (): Promise<string | undefined> => {
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        return line.replace(/\r$/, "");
      }
      if (ended) {
        const rest = buffer;
        buffer = "";
        return rest === "" ? undefined : rest;
      }
      await new Promise<void>((resolve) => {
        waiting = resolve;
      });
    }
  };
}

export function createPrompter(input: InputStream, output: OutputStream): Prompter {
  if (input.isTTY) {
    return {
      interactive: true,
      ask: (label, { secret = false } = {}) => askOnTerminal(input, output, label, secret),
    };
  }
  const nextLine = createLineQueue(input);
  return { interactive: false, ask: () => nextLine() };
}
