import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { ReactNode } from "react";

import { apiCall } from "@/lib/api-client";

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
function waitText(retryAfterSeconds: number | undefined): string {
  return retryAfterSeconds === undefined
    ? "Spróbuj później."
    : `Spróbuj za ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min.`;
}

export function resendFeedback(state: ResendState): { role: "status" | "alert"; content: ReactNode } | null {
  switch (state.kind) {
    case "sent":
      return { role: "status", content: "Wysłano. Nowy link zastępuje poprzedni." };
    case "limited":
      return { role: "alert", content: `Za wiele prób. ${waitText(state.retryAfterSeconds)}` };
    case "failed":
      return { role: "alert", content: "Nie udało się wysłać wiadomości. Spróbuj później." };
    case "quota":
      return {
        role: "alert",
        content: "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro. Gra nie zależy od potwierdzenia.",
      };
    case "network":
      return { role: "alert", content: "Nie udało się połączyć z serwerem. Spróbuj ponownie." };
    case "already":
      return {
        role: "status",
        content: (
          <>
            Ten adres jest już potwierdzony.{" "}
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Odśwież stronę
            </Button>
          </>
        ),
      };
    case "expired":
      return {
        role: "alert",
        content: (
          <>
            Sesja wygasła. <TextLink href={LOGIN_TO_RESEND_HREF}>Zaloguj się</TextLink>, aby wysłać link.
          </>
        ),
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
