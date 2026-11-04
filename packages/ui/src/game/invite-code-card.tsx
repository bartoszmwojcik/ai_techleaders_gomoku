import { Check, Copy, Share2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { Panel } from "./panel";

type InviteCodeCardProps = {
  /** Heading of the card (required). */
  title: ReactNode;
  /** The invitation link (required). */
  link: string;
  /** The code that can be typed on /join (required). */
  code: string;
  /** Name of the link line and of the code line (required, passed in). */
  linkLabel: string;
  codeLabel: string;
  /** The QR code of the same link (`QrCode`), beside the link and the code; wraps under them when there is no room. */
  qr?: ReactNode;
  /** Until when the invitation works, e.g. "Ważne do 18:40". */
  validUntil?: ReactNode;
  /** Copies the link. The page does the copying (Clipboard API) and then sets `copied`. */
  copyLabel: string;
  copiedLabel: string;
  copied?: boolean;
  onCopy: () => void;
  /** The share button is shown only when the browser can share, i.e. when this is given. */
  shareLabel?: string;
  onShare?: () => void;
  /** Cancels the invitation; shown when given. */
  cancelLabel?: string;
  onCancel?: () => void;
  className?: string;
};

// Link and code of one invitation (BR-11). The code is big because people read it out and type it.
function InviteCodeCard({
  title,
  link,
  code,
  linkLabel,
  codeLabel,
  qr,
  validUntil,
  copyLabel,
  copiedLabel,
  copied = false,
  onCopy,
  shareLabel,
  onShare,
  cancelLabel,
  onCancel,
  className,
}: InviteCodeCardProps) {
  return (
    <Panel title={title} className={cn("max-w-(--layout-width-dialog)", className)}>
      <div className="flex flex-wrap items-start gap-stack">
        <dl className="m-0 flex min-w-0 flex-1 basis-(--layout-width-qr) flex-col gap-stack">
          <div className="flex flex-col gap-group">
            <dt className="text-meta font-strong text-text-secondary">{linkLabel}</dt>
            <dd className="m-0 text-body text-text-primary select-all">{link}</dd>
          </div>
          <div className="flex flex-col gap-group">
            <dt className="text-meta font-strong text-text-secondary">{codeLabel}</dt>
            <dd className="m-0 text-section font-strong tracking-widest text-text-primary select-all">{code}</dd>
          </div>
        </dl>
        {qr}
      </div>
      {validUntil && <p className="m-0 text-meta text-text-muted">{validUntil}</p>}
      <div className="flex flex-wrap gap-group">
        <Button variant="secondary" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? copiedLabel : copyLabel}
        </Button>
        {onShare && shareLabel && (
          <Button variant="secondary" onClick={onShare}>
            <Share2 aria-hidden="true" />
            {shareLabel}
          </Button>
        )}
        {onCancel && cancelLabel && (
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
      </div>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </Panel>
  );
}

export { InviteCodeCard };
export type { InviteCodeCardProps };
