"use client";

import { VerifyEmailBanner, type VerifyEmailState } from "@gomoku/ui/game/verify-email-banner";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  isBannerVisible,
  readClosedAt,
  rememberClosed,
  subscribeToBannerMemory,
} from "./verify-email-banner-memory";
import { requestNewLink, resendFeedback, type ResendState } from "./resend-verification";

type VerifyEmailNoticeProps = {
  userId: string;
  /** Shown only to the owner of the account, so it may appear in the text. */
  email: string;
};

/** The design system banner has five states; the other outcomes use the closest one (map L11, gap D02). */
function bannerState(state: ResendState): VerifyEmailState {
  switch (state.kind) {
    case "idle":
    case "sending":
    case "limited":
      return state.kind;
    case "sent":
    case "already":
      return "sent";
    default:
      return "failed";
  }
}

// Programmatic focus lands on text or a heading, not on a control, so its own outline is hidden.
function focusQuietly(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.setAttribute("tabindex", "-1");
  element.style.outline = "none";
  element.focus();
}

/**
 * The "Potwierdź adres e-mail" banner of `/` and `/account` for an unconfirmed address (BR-26): it
 * blocks nothing, can be closed and returns after 7 days. Rendering decisions: the server renders
 * nothing (no stored choice to read there) and the browser shows the banner after hydration, so
 * markup never differs between the two and a closed banner never flashes. The choice is read from
 * `localStorage` through `useSyncExternalStore` (server snapshot: hidden); unreadable storage means visible.
 */
export function VerifyEmailNotice({ userId, email }: VerifyEmailNoticeProps) {
  const open = useSyncExternalStore(
    subscribeToBannerMemory,
    () => isBannerVisible(readClosedAt(userId), Date.now()),
    () => false,
  );
  // When storage refuses the write, the banner is still hidden until the next page load.
  const [closedHere, setClosedHere] = useState(false);
  const [resend, setResend] = useState<ResendState>({ kind: "idle" });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // The outcome text gets the focus (a disabled or busy button cannot keep it), so it is read out.
  useEffect(() => {
    if (resend.kind === "idle" || resend.kind === "sending") return;
    focusQuietly(wrapperRef.current?.querySelector<HTMLElement>("p[role=status], p[role=alert]"));
  }, [resend]);

  if (!open || closedHere) return null;

  async function onResend() {
    setResend({ kind: "sending" });
    setResend(await requestNewLink());
  }

  function onDismiss() {
    if (!rememberClosed(userId, Date.now())) setClosedHere(true);
    // The banner disappears with the focused button: continue from the page heading.
    focusQuietly(document.querySelector<HTMLElement>("main h1"));
  }

  const feedback = resendFeedback(resend);
  return (
    <div ref={wrapperRef} data-testid="verify-email-banner" className="w-full">
      <VerifyEmailBanner
        title="Potwierdź adres e-mail"
        resendLabel="Wyślij ponownie"
        dismissLabel="Zamknij"
        onDismiss={onDismiss}
        state={bannerState(resend)}
        feedback={feedback?.content}
        onResend={() => void onResend()}
      >
        Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła. Link wysyłamy na {email} — sprawdź też
        folder spam.
      </VerifyEmailBanner>
    </div>
  );
}
