import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { ReactNode } from "react";

import plAuth from "@/i18n/catalogs/pl/auth";
import { textsOf, type TranslatorOf } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { apiCall } from "@/lib/api-client";

export type AuthTranslator = TranslatorOf<"auth">;

const PL_AUTH: AuthTranslator = textsOf<"auth">(plAuth);

/** Where a signed-out visitor goes to sign in before asking for a new link (s03.6). */
export const LOGIN_TO_RESEND_HREF = "/login?next=/account";

export type ResendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "limited"; retryAfterSeconds?: number }
  | { kind: "failed" }
  | { kind: "quota" }
  | { kind: "network" }
  | { kind: "already" }
  | { kind: "expired" };

/** The "try again in N min" part of the limit message: whole minutes, rounded up, at least 1. */
function waitText(t: AuthTranslator, retryAfterSeconds: number | undefined): string {
  return retryAfterSeconds === undefined
    ? t("resend.later")
    : t("resend.inMinutes", { minutes: t.number(Math.max(1, Math.ceil(retryAfterSeconds / 60))) });
}

/** What a resend request ended with, in the reader's language (Polish by default). */
export function resendFeedback(
  state: ResendState,
  t: AuthTranslator = PL_AUTH,
): { role: "status" | "alert"; content: ReactNode } | null {
  switch (state.kind) {
    case "sent":
      return { role: "status", content: t("resend.sent") };
    case "limited":
      return { role: "alert", content: t("resend.limited", { wait: waitText(t, state.retryAfterSeconds) }) };
    case "failed":
      return { role: "alert", content: t("resend.failed") };
    case "quota":
      return { role: "alert", content: t("resend.quota") };
    case "network":
      return { role: "alert", content: t("resend.network") };
    case "already":
      return {
        role: "status",
        content: (
          <>
            {t("resend.already")}{" "}
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t("resend.refresh")}
            </Button>
          </>
        ),
      };
    case "expired":
      return {
        role: "alert",
        content: withNodes(t("resend.expired", { link: "{link}" }), {
          link: <TextLink href={LOGIN_TO_RESEND_HREF}>{t("resend.login")}</TextLink>,
        }),
      };
    default:
      return null;
  }
}

const RESEND_STATE_BY_CODE: Record<string, ResendState> = {
  EMAIL_SEND_FAILED: { kind: "failed" },
  EMAIL_QUOTA_EXCEEDED: { kind: "quota" },
  ALREADY_VERIFIED: { kind: "already" },
  UNAUTHORIZED: { kind: "expired" },
  network: { kind: "network" },
};

/** Asks the server for a new verification link and maps the answer to a state (never throws). */
export async function requestNewLink(): Promise<ResendState> {
  const result = await apiCall<null>("/api/auth/email-verification/resend");
  if (result.ok) return { kind: "sent" };
  const { code, retryAfterSeconds } = result.error;
  return code === "RATE_LIMITED"
    ? { kind: "limited", retryAfterSeconds }
    : (RESEND_STATE_BY_CODE[code] ?? { kind: "failed" });
}
