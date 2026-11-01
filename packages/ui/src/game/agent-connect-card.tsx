import { Check, ChevronDown, Copy } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { Field } from "./field";
import { Select, type SelectOption } from "./select";

type AgentConnectCardProps = {
  /** Heading of the collapsible panel (required, passed in). */
  summary: ReactNode;
  /** Choice of the agent client above step 1; the page keeps the value (no persistence). */
  clientLabel: string;
  clients: SelectOption[];
  client: string;
  onClientChange: (value: string) => void;
  /** Step 1: what to run or paste, then the snippet itself (a command or file content, a text to copy). */
  snippetIntro: ReactNode;
  snippet: string;
  copySnippetLabel: string;
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
  copied?: "snippet" | "code" | null;
  onCopySnippet: () => void;
  onCopyCode: () => void;
  /** Closing remarks, e.g. other clients and what the agent does not need. */
  note?: ReactNode;
  /** Starts expanded; the default is collapsed so the panel does not push the invitation away. */
  defaultOpen?: boolean;
  className?: string;
};

const textBlock = "m-0 rounded-base border border-border-default bg-surface-page p-3 text-meta text-text-primary break-words no-ligatures whitespace-pre-wrap select-all";

// Words that start with "-" (command options) must not break after the hyphens: the line-breaking
// rules allow a break after a hyphen. The text content stays identical, so copying is unaffected.
function SnippetText({ text }: { text: string }) {
  return text.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 && "\n"}
      {line.split(/(\s+)/).map((part, partIndex) =>
        part.startsWith("-") ? (
          <span key={partIndex} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </Fragment>
  ));
}

// How to connect an LLM agent over MCP (D-28): server address, command and invitation code.
// Native <details> gives keyboard and screen-reader support without a script.
function AgentConnectCard({
  summary,
  clientLabel,
  clients,
  client,
  onClientChange,
  snippetIntro,
  snippet,
  copySnippetLabel,
  checkText,
  codeIntro,
  code,
  copyCodeLabel,
  serverLabel,
  serverUrl,
  copiedLabel,
  copied = null,
  onCopySnippet,
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
        <Field label={clientLabel}>
          {(control) => (
            <Select options={clients} value={client} onChange={(event) => onClientChange(event.target.value)} {...control} />
          )}
        </Field>
        <ol className="m-0 flex list-decimal flex-col gap-stack pl-6 text-body text-text-primary marker:text-text-secondary">
          <li>
            <div className="flex flex-col gap-group">
              {snippetIntro}
              <p data-copy="snippet" className={textBlock}>
                <SnippetText text={snippet} />
              </p>
              <div>
                <Button variant="secondary" onClick={onCopySnippet}>
                  {copied === "snippet" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "snippet" ? copiedLabel : copySnippetLabel}
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
          <dd className="m-0 text-meta text-text-primary break-words select-all">{serverUrl}</dd>
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
