import { TruncatedName } from "@gomoku/ui/game/truncated-name";
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
 * The cutting rule itself is the design system's `TruncatedName` (#135); this wrapper only maps a
 * participant onto its lead, name and tail.
 */
export function PlayerLabel({ name, you = false, testId = "player-name" }: Props): ReactNode {
  if (name.agent) return <AgentLabel name={name} agent={name.agent} testId={testId} />;
  if (!name.guest) return you ? `Ty (${name.nick})` : name.nick;
  return (
    <TruncatedName lead={you ? "Ty: " : undefined} tail=" (gość)" title={name.label} data-testid={testId}>
      {name.nick}
    </TruncatedName>
  );
}

function AgentLabel({ name, agent, testId }: { name: PlayerName; agent: NonNullable<PlayerName["agent"]>; testId: string }): ReactNode {
  if (agent.declared === null) {
    return (
      <span className="flex min-w-0 max-w-full items-baseline" title={name.label} data-testid={testId}>
        <span className="shrink-0 whitespace-pre">{name.nick}</span>
      </span>
    );
  }
  return (
    <TruncatedName lead={`${name.nick} · `} tail={` ${DECLARED_LABEL}`} title={name.label} data-testid={testId}>
      {agent.declared}
    </TruncatedName>
  );
}
