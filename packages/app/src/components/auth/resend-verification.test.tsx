import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiCall: vi.fn() }));

import frAuth from "@/i18n/catalogs/fr/auth";
import { textsOf } from "@/i18n/client";

import { resendFeedback, type ResendState } from "./resend-verification";

const fr = textsOf<"auth">(frAuth, { locale: "fr", dict: frAuth });
const text = (state: ResendState, t = fr) => {
  const feedback = resendFeedback(state, t);
  return feedback && { role: feedback.role, html: renderToStaticMarkup(<>{feedback.content}</>) };
};

describe("resendFeedback in French (E15-S03)", () => {
  it("words every outcome in the reader's language", () => {
    expect(text({ kind: "sent" })).toEqual({ role: "status", html: "Envoyé. Le nouveau lien remplace le précédent." });
    expect(text({ kind: "limited", retryAfterSeconds: 61 })).toEqual({ role: "alert", html: "Trop de tentatives. Réessayez dans 2 min." });
    expect(text({ kind: "limited" })?.html).toBe("Trop de tentatives. Réessayez plus tard.");
    expect(text({ kind: "failed" })?.html).toBe("Impossible d’envoyer le message. Réessayez plus tard.");
    expect(text({ kind: "quota" })?.html).toContain("Réessayez demain.");
    expect(text({ kind: "network" })?.html).toBe("Impossible de joindre le serveur. Réessayez.");
    expect(text({ kind: "already" })?.html).toContain("Cette adresse est déjà confirmée. <button");
    expect(text({ kind: "already" })?.html).toContain("Actualiser la page</button>");
    expect(text({ kind: "expired" })?.html).toMatch(/^Session expirée\. <a [^>]*href="\/login\?next=\/account"[^>]*>Connectez-vous<\/a> pour envoyer le lien\.$/);
    expect(text({ kind: "idle" })).toBeNull();
  });

  it("stays Polish without a translator", () => {
    const feedback = resendFeedback({ kind: "expired" });
    expect(renderToStaticMarkup(<>{feedback?.content}</>)).toMatch(/^Sesja wygasła\. <a [^>]*>Zaloguj się<\/a>, aby wysłać link\.$/);
  });
});
