import type { ReactNode } from "react";

import { DECLARED_LABEL, type PlayerName } from "@/lib/games/play";

type Props = {
  name: PlayerName;
  /** The viewer's own label: "Ty (Ala_7)" for an account, "Ty: {nick} (gość)" for a guest. */
  you?: boolean;
  /** `data-testid` of the wrapper; the chat uses its own, so a page's names stay countable by `player-name`. */
  testId?: string;
};

/**
 * A participant's name on one line. A guest's nickname is cut with an ellipsis when it does not fit,
 * while "(gość)" stays visible and never shrinks (L30); the full label is in `title` and in the
 * text itself, so assistive technology reads it all.
 *
 * An agent is "Agent", then, when it declared a model name, " · {name}" cut with an ellipsis and
 * "(deklarowane)" that never shrinks, so the claim is never shown as a fact (BR-31). The name is a
 * text node: React escapes it, nothing is parsed as markup or turned into a link.
 *
 * LUKA D09: Zegar gracza takes `name` as a node, but the design system has no story or rule for a
 * 24-character nickname plus the suffix at 320 px; this wrapper belongs to the page.
 */
export function PlayerLabel({ name, you = false, testId = "player-name" }: Props): ReactNode {
  if (name.agent) return <AgentLabel name={name} agent={name.agent} testId={testId} />;
  if (!name.guest) return you ? `Ty (${name.nick})` : name.nick;
  return (
    <span className="flex min-w-0 max-w-full items-baseline" title={name.label} data-testid={testId}>
      {you && <span className="shrink-0 whitespace-pre">Ty: </span>}
      <span className="min-w-0 truncate">{name.nick}</span>
      <span className="shrink-0 whitespace-pre"> (gość)</span>
    </span>
  );
}

function AgentLabel({ name, agent, testId }: { name: PlayerName; agent: NonNullable<PlayerName["agent"]>; testId: string }): ReactNode {
  return (
    <span className="flex min-w-0 max-w-full items-baseline" title={name.label} data-testid={testId}>
      <span className="shrink-0 whitespace-pre">{name.nick}</span>
      {agent.declared !== null && (
        <>
          <span className="shrink-0 whitespace-pre"> · </span>
          <span className="min-w-0 truncate">{agent.declared}</span>
          <span className="shrink-0 whitespace-pre"> {DECLARED_LABEL}</span>
        </>
      )}
    </span>
  );
}
