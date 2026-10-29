// Thin typed wrapper around the agent-browser CLI (https://agent-browser.dev). Every call
// runs `agent-browser --session <session> --json <command…>` and returns the `data` field;
// a failed command (`success: false` or a non-zero exit code) throws with the CLI's error.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const AGENT_BROWSER_BIN = resolve(import.meta.dirname, "../../node_modules/.bin/agent-browser");

type CliResult<T> = { success: boolean; data: T; error: string | null };

export class Browser {
  constructor(readonly session: string) {}

  async run<T = Record<string, unknown>>(...args: string[]): Promise<T> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(AGENT_BROWSER_BIN, ["--session", this.session, "--json", ...args]));
    } catch (error) {
      // Non-zero exit: the JSON error is still printed on stdout.
      stdout = (error as { stdout?: string }).stdout ?? "";
      if (!stdout) throw error;
    }
    const result = JSON.parse(stdout) as CliResult<T>;
    if (!result.success) throw new Error(`agent-browser ${args.join(" ")}: ${result.error}`);
    return result.data;
  }

  async open(url: string): Promise<{ title: string; url: string }> {
    return this.run("open", url);
  }

  async text(selector: string): Promise<string> {
    return (await this.run<{ text: string }>("get", "text", selector)).text;
  }

  async count(selector: string): Promise<number> {
    return (await this.run<{ count: number }>("get", "count", selector)).count;
  }

  async title(): Promise<string> {
    return (await this.run<{ title: string }>("get", "title")).title;
  }

  async url(): Promise<string> {
    return (await this.run<{ url: string }>("get", "url")).url;
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.run("fill", selector, value);
  }

  async click(selector: string): Promise<void> {
    await this.run("click", selector);
  }

  /** Waits until an element matching `selector` is in the page. */
  async waitFor(selector: string): Promise<void> {
    await this.run("wait", selector);
  }

  /** Waits until the JavaScript expression is truthy in the page. */
  async waitForFn(expression: string): Promise<void> {
    await this.run("wait", "--fn", expression);
  }

  /** Evaluates a JavaScript expression in the page and returns its (JSON) value. */
  async evaluate<T>(expression: string): Promise<T> {
    return (await this.run<{ result: T }>("eval", expression)).result;
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.run("set", "viewport", String(width), String(height));
  }

  /** Extra headers for every request of the session, e.g. the client address behind our proxy. */
  async setHeaders(headers: Record<string, string>): Promise<void> {
    await this.run("set", "headers", JSON.stringify(headers));
  }

  /** Emulates the `prefers-color-scheme` preference of the system. */
  async setMedia(scheme: "dark" | "light"): Promise<void> {
    await this.run("set", "media", scheme);
  }

  /** Presses a key at the current focus (e.g. `Tab`, `Enter`, `Space`). */
  async press(key: string): Promise<void> {
    await this.run("press", key);
  }

  async cookies(): Promise<
    { name: string; value: string; path: string; sameSite: string; secure: boolean; httpOnly: boolean; expires: number }[]
  > {
    return (await this.run<{ cookies: never[] }>("cookies", "get")).cookies;
  }

  async setCookie(name: string, value: string, url: string): Promise<void> {
    await this.run("cookies", "set", name, value, "--url", url);
  }

  async clearCookies(): Promise<void> {
    await this.run("cookies", "clear");
  }

  async close(): Promise<void> {
    await this.run("close");
  }
}
