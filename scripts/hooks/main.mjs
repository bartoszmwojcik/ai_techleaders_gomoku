// Claude Code PreToolUse hook: reads the hook JSON from stdin, exit code 2 blocks the tool call
// and shows the reason (stderr) to the agent. Exit code 0 lets it through.
import { checkEdit } from "./guard-edits.mjs";

export async function main({ readStdin, fileExists, error }) {
  const { tool_name: toolName, tool_input: toolInput, cwd } = JSON.parse(await readStdin());
  const reason = checkEdit({ toolName, toolInput, fileExists, cwd });
  if (reason === null) return 0;
  error(reason);
  return 2;
}
