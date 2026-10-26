import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { VerifyEmailBanner, type VerifyEmailState } from "@gomoku/ui/game/verify-email-banner";
import type { ReactNode } from "react";

import { applyVerifiedElsewhere, bannerVisible, dismissBanner, resend, setBanner, useSim, viewer, type ResendOutcome } from "../sim";

// Texts of the results of "Wyślij ponownie". Where the design system banner has no state for an outcome
// (503 quota, 409 already confirmed, 401 expired session) the closest state carries it: LUKA D02, map L11.
export function resendFeedback(outcome: ResendOutcome): { state: VerifyEmailState; feedback: ReactNode } {
  switch (outcome) {
    case "sent":
      return { state: "sent", feedback: "Wysłano. Nowy link zastępuje poprzedni." };
    case "limited":
      return { state: "limited", feedback: "Za wiele prób. Spróbuj za 41 min." };
    case "failed":
      return { state: "failed", feedback: "Nie udało się wysłać wiadomości. Spróbuj później." };
    case "quota":
      return { state: "failed", feedback: "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro. Gra nie zależy od potwierdzenia." };
    case "already":
      return {
        state: "sent",
        feedback: (
          <>
            Ten adres jest już potwierdzony.{" "}
            <Button variant="secondary" onClick={applyVerifiedElsewhere}>Odśwież stronę</Button>
          </>
        ),
      };
    case "expired":
      return { state: "failed", feedback: <>Sesja wygasła. <TextLink href="#s02">Zaloguj się</TextLink>, aby wysłać link.</> };
  }
}

/** The e-mail confirmation banner of `/` and `/account` (s04.2, s05.2). */
export function ConfirmBanner() {
  const sim = useSim();
  const account = viewer(sim);
  // s04.13: a closed banner stays away for 7 days (the real page remembers it in the browser).
  if (!account || account.verified || !bannerVisible(sim)) return null;
  const { state, outcome } = sim.banner;
  const result = outcome === "none" ? null : resendFeedback(outcome);
  async function onResend() {
    setBanner("sending");
    const result = await resend();
    setBanner(resendFeedback(result).state, result);
  }
  return (
    <VerifyEmailBanner
      title="Potwierdź adres e-mail"
      resendLabel="Wyślij ponownie"
      dismissLabel="Zamknij"
      onDismiss={dismissBanner}
      state={state === "sending" ? "sending" : (result?.state ?? "idle")}
      feedback={result?.feedback}
      onResend={onResend}
    >
      Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła. Link wysyłamy na {account.email} — sprawdź też folder spam.
    </VerifyEmailBanner>
  );
}
