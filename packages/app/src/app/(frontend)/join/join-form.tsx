"use client";

import { formatInvitationCode, INVITATION_CODE_LENGTH } from "@gomoku/core";
import { Button } from "@gomoku/ui/game/button";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { FormField } from "@/components/forms/form-field";

const CODE_ID = "join-code";

/**
 * p02: the code typed by hand, any case, with or without a dash or spaces. Only the shape is
 * checked here; whether the code means anything is decided by the invitation page, which is
 * also where the lookup limit applies (#21 Q12, Q13), so this page is no oracle for codes.
 */
export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  // State alone lags a double submit by one render; the ref closes that gap.
  const inFlight = useRef(false);

  // Coming back to this page from the browser's back/forward cache keeps the old state, so the
  // button would stay disabled; a restored page starts over. A normal navigation unmounts the form.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      inFlight.current = false;
      setPending(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const cleaned = code.replace(/[\s-]+/g, "").toUpperCase();
    if (cleaned.length !== INVITATION_CODE_LENGTH) {
      setError("Sprawdź kod: ma 8 znaków.");
      document.getElementById(CODE_ID)?.focus();
      return;
    }
    setError(undefined);
    // Stay pending while the page navigates, so a second submit is impossible.
    inFlight.current = true;
    setPending(true);
    router.push(`/invite/${encodeURIComponent(formatInvitationCode(cleaned))}`);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="join-form">
      <FormField
        id={CODE_ID}
        name="code"
        label="Kod zaproszenia"
        hint="8 znaków. Wielkość liter i myślnik nie mają znaczenia."
        error={error}
        required
        autoComplete="off"
        inputMode="text"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button type="submit" loading={pending}>
        {pending ? "Sprawdzanie kodu…" : "Dalej"}
      </Button>
    </form>
  );
}
