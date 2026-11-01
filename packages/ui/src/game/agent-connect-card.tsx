import { Check, ChevronDown, Copy } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";

type AgentConnectCardProps = {
  /** Heading of the collapsible panel (required, passed in). */
  summary: ReactNode;
  /** Step 1: what to run, then the command itself (a text to copy). */
  commandIntro: ReactNode;
  command: string;
  copyCommandLabel: string;
  /** Step 2: how to check the connection. */
  checkText: ReactNode;
  /** Step 3: what to tell the agent, then the invitation code (a text to copy). */
  codeIntro: ReactNode;
  code: string;
  copyCodeLabel: string;
  /** Address of the MCP server, as a line to select. */
  serverLabel: string;
  serverUrl: string;
  /** Label of a copy button that has just worked; also announced to screen readers. */
  copiedLabel: string;
  /** Which text was copied last. The page does the copying (Clipboard API) and then sets this. */
  copied?: "command" | "code" | null;
  onCopyCommand: () => void;
  onCopyCode: () => void;
  /** Closing remarks, e.g. other clients and what the agent does not need. */
  note?: ReactNode;
  /** Starts expanded; the default is collapsed so the panel does not push the invitation away. */
  defaultOpen?: boolean;
  className?: string;
};

const textBlock = "m-0 rounded-base border border-border-default bg-surface-page p-3 text-meta text-text-primary break-all whitespace-pre-wrap select-all";

// How to connect an LLM agent over MCP (D-28): server address, command and invitation code.
// Native <details> gives keyboard and screen-reader support without a script.
function AgentConnectCard({
  summary,
  commandIntro,
  command,
  copyCommandLabel,
  checkText,
  codeIntro,
  code,
  copyCodeLabel,
  serverLabel,
  serverUrl,
  copiedLabel,
  copied = null,
  onCopyCommand,
  onCopyCode,
  note,
  defaultOpen = false,
  className,
}: AgentConnectCardProps) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group min-w-0 max-w-(--layout-width-dialog) rounded-base border border-border-default bg-surface-raised wrap-anywhere",
        className,
      )}
    >
      <summary className="motion-fast flex min-h-target cursor-pointer list-none items-center justify-between gap-group rounded-base px-4 py-3 text-subsection font-strong text-text-primary focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown aria-hidden="true" className="size-(--icon-size-md) shrink-0 group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-stack px-4 pb-4">
        <ol className="m-0 flex list-decimal flex-col gap-stack pl-6 text-body text-text-primary marker:text-text-secondary">
          <li>
            <div className="flex flex-col gap-group">
              {commandIntro}
              <p data-copy="command" className={textBlock}>{command}</p>
              <div>
                <Button variant="secondary" onClick={onCopyCommand}>
                  {copied === "command" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "command" ? copiedLabel : copyCommandLabel}
                </Button>
              </div>
            </div>
          </li>
          <li>{checkText}</li>
          <li>
            <div className="flex flex-col gap-group">
              {codeIntro}
              <p data-copy="code" className="m-0 text-subsection font-strong tracking-widest text-text-primary select-all">{code}</p>
              <div>
                <Button variant="secondary" onClick={onCopyCode}>
                  {copied === "code" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "code" ? copiedLabel : copyCodeLabel}
                </Button>
              </div>
            </div>
          </li>
        </ol>
        <dl className="m-0 flex flex-col gap-group">
          <dt className="text-meta font-strong text-text-secondary">{serverLabel}</dt>
          <dd className="m-0 text-meta text-text-primary break-all select-all">{serverUrl}</dd>
        </dl>
        {note && <p className="m-0 text-meta text-text-secondary">{note}</p>}
        <span role="status" className="sr-only">
          {copied ? copiedLabel : ""}
        </span>
      </div>
    </details>
  );
}

export { AgentConnectCard };
export type { AgentConnectCardProps };
