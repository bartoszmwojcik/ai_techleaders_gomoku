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

  async close(): Promise<void> {
    await this.run("close");
  }
}
