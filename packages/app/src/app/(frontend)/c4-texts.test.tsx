// @vitest-environment jsdom
// Signing in and the account in French (E15-S06, package C4); the Polish tests stay next to each screen. Field
// messages of the schemas of `core` are French since E15-S07 (C5): see `c5-texts.test.tsx`.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, refresh, fullPageLoad } = vi.hoisted(() => ({ apiCall: vi.fn(), refresh: vi.fn(), fullPageLoad: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("@/lib/full-page-load", () => ({ fullPageLoad }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

import frAccount from "@/i18n/catalogs/fr/account";
import frAuth from "@/i18n/catalogs/fr/auth";
import frCommon from "@/i18n/catalogs/fr/common";
import { textsOf } from "@/i18n/client";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";

import { ChangeDisplayNameForm } from "./account/change-display-name-form";
import { ChangeEmailForm } from "./account/change-email-form";
import { ChangePasswordForm } from "./account/change-password-form";
import { DeleteAccountForm } from "./account/delete-account-form";
import { ConfirmEmailChange } from "./confirm-email-change/confirm-email-change";
import { ForgotPasswordForm } from "./forgot-password/forgot-password-form";
import { LoginForm } from "./login/login-form";
import { RegisterForm } from "./register/register-form";
import { ResetPasswordForm } from "./reset-password/reset-password-form";
import { ConfirmEmail } from "./verify-email/confirm-email";

const auth = { locale: "fr", dict: frAuth } as const;
const common = { locale: "fr", dict: frCommon } as const;
const account = { texts: { locale: "fr", dict: frAccount }, commonTexts: common } as const;
const fail = (code: string, extra: Record<string, unknown> = {}) => ({ ok: false, error: { code, message: "x", ...extra } });
const press = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));

beforeEach(() => {
  apiCall.mockReset();
  refresh.mockReset();
  fullPageLoad.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("the limit message in French", () => {
  it("rounds the wait up to minutes", () => {
    const fr = textsOf<"common">(frCommon, common);
    expect(rateLimitedError(61, fr)).toEqual({ title: "Trop de tentatives", details: "Réessayez dans 2 min." });
    expect(rateLimitedError(undefined, fr).details).toBe("Réessayez dans un moment.");
  });
});

describe("signing in, in French", () => {
  const fill = async () => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "ala@example.com");
    await user.type(screen.getByLabelText(/^Mot de passe/), "secret123");
  };

  it("words the login form and its refusals", async () => {
    render(<LoginForm nextPath="/" {...auth} commonTexts={common} />);
    expect(screen.getByRole("link", { name: "Mot de passe oublié ?" })).toBeTruthy();
    await fill();
    for (const [answer, text] of [
      [fail("INVALID_CREDENTIALS"), "E-mail ou mot de passe incorrect"],
      [fail("RATE_LIMITED", { retryAfterSeconds: 60 }), "Trop de tentatives"],
      [fail("ALREADY_AUTHENTICATED"), "Une session est active dans un autre onglet. Continuer."],
      [fail("network"), "Pas de connexion"],
      [fail("INTERNAL"), "Impossible de se connecter"],
    ] as const) {
      apiCall.mockResolvedValueOnce(answer);
      if (!(screen.getByLabelText(/^Mot de passe/) as HTMLInputElement).value) await userEvent.type(screen.getByLabelText(/^Mot de passe/), "secret123");
      await press("Se connecter");
      expect(screen.getByTestId("login-error").textContent).toContain(text);
    }
  });

  it("words the registration form and a taken address", async () => {
    render(<RegisterForm nextPath="/" {...auth} commonTexts={common} />);
    expect(screen.getByText(/Il sert à vous connecter/)).toBeTruthy();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "ala@example.com");
    await user.type(screen.getByLabelText(/Nom de joueur/), "Ala_7");
    for (const [answer, text] of [
      [fail("CONFLICT"), "Si vous avez déjà un compte, connectez-vous."],
      [fail("RATE_LIMITED"), "Réessayez dans un moment."],
      [fail("ALREADY_AUTHENTICATED"), "Aller à l’accueil"],
      [fail("network"), "sauf le mot de passe"],
      [fail("INTERNAL"), "Impossible de créer le compte"],
    ] as const) {
      apiCall.mockResolvedValueOnce(answer);
      await user.type(screen.getByLabelText(/^Mot de passe/), "secret123");
      await press("Créer un compte");
      expect(screen.getByTestId("register-error").textContent).toContain(text);
    }
  });

  it("words the forgotten and the new password", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ForgotPasswordForm {...auth} commonTexts={common} />);
    await user.type(screen.getByLabelText(/E-mail/), "ala@example.com");
    apiCall.mockResolvedValueOnce(fail("network"));
    await press("Envoyer le lien");
    expect(screen.getByTestId("forgot-error").textContent).toContain("L’adresse saisie a été conservée");
    apiCall.mockResolvedValueOnce(fail("RATE_LIMITED"));
    await press("Envoyer le lien");
    apiCall.mockResolvedValueOnce(fail("INTERNAL"));
    await press("Envoyer le lien");
    expect(screen.getByTestId("forgot-error").textContent).toContain("Impossible d’envoyer la demande");
    apiCall.mockResolvedValueOnce({ ok: true, data: null });
    await press("Envoyer le lien");
    expect(screen.getByText("Consultez votre boîte de réception")).toBeTruthy();
    unmount();

    render(<ResetPasswordForm token="t" {...auth} commonTexts={common} />);
    await user.type(screen.getByLabelText(/Nouveau mot de passe/), "secret123");
    for (const code of ["RATE_LIMITED", "network", "INTERNAL"]) {
      apiCall.mockResolvedValueOnce(fail(code));
      await press("Définir le nouveau mot de passe");
      if (!(screen.getByLabelText(/Nouveau mot de passe/) as HTMLInputElement).value) await user.type(screen.getByLabelText(/Nouveau mot de passe/), "secret123");
    }
    expect(screen.getByTestId("reset-error").textContent).toContain("Impossible de changer le mot de passe");
    apiCall.mockResolvedValueOnce({ ok: true, data: null });
    await press("Définir le nouveau mot de passe");
    expect(screen.getByText("Mot de passe modifié")).toBeTruthy();
  });

  it("words an incomplete reset link", () => {
    render(<ResetPasswordForm token={undefined} {...auth} />);
    expect(screen.getByText("Ce lien est incomplet")).toBeTruthy();
  });

  it("words confirming the address and its change", async () => {
    const { unmount } = render(<ConfirmEmail token="t" nextPath="/" signedIn={false} alreadyVerified={false} {...auth} />);
    expect(screen.getByRole("heading", { name: "Confirmez votre adresse e-mail" })).toBeTruthy();
    apiCall.mockResolvedValueOnce({ ok: true, data: { next: "/" } });
    await press("Confirmer l’e-mail");
    expect(screen.getByText("Adresse confirmée")).toBeTruthy();
    expect(document.body.textContent).toContain("Connectez-vous pour jouer.");
    unmount();

    render(<ConfirmEmailChange token="t" {...auth} />);
    apiCall.mockResolvedValueOnce(fail("network"));
    await press("Confirmer la nouvelle adresse");
    expect(screen.getByText("Pas de connexion")).toBeTruthy();
    apiCall.mockResolvedValueOnce(fail("INVALID_TOKEN"));
    await press("Réessayer");
    expect(screen.getByText("Le lien a expiré ou a déjà été utilisé.")).toBeTruthy();
  });
});

describe("the account in French", () => {
  it("words the name, the address and the password forms", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ChangeDisplayNameForm displayName="Ala_7" availableAt="2026-01-15T09:00:00.000Z" {...account} />
        <ChangeEmailForm {...account} />
        <ChangePasswordForm {...account} />
      </>,
    );
    expect(screen.getByTestId("change-name-locked").textContent).toBe("Prochain changement possible après le jeudi 15 janvier à 10:00 CET.");
    await user.type(screen.getByLabelText(/Nouvelle adresse e-mail/), "nowy@example.com");
    for (const [code, text] of [
      ["ADMIN_EMAIL_LOCKED", "Impossible de changer l’adresse"],
      ["RATE_LIMITED", "Trop de tentatives"],
      ["network", "Les données saisies ont été conservées"],
    ] as const) {
      apiCall.mockResolvedValueOnce(fail(code));
      const password = screen.getAllByLabelText(/Mot de passe actuel/)[0] as HTMLInputElement;
      if (!password.value) await user.type(password, "secret123");
      await press("Changer l’adresse e-mail");
      expect(screen.getByTestId("change-email-error").textContent).toContain(text);
    }
    expect(screen.getByText("Déconnexion des autres appareils")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Changer le mot de passe" })).toBeTruthy();
  });

  it("words deleting the account", async () => {
    render(<DeleteAccountForm displayName="Ala_7" currentGame={{ gameId: "g1", status: "active" }} {...account} />);
    expect(screen.getByText("Terminez ou abandonnez d’abord votre partie.")).toBeTruthy();
    expect(screen.getByText("La suppression n’est possible qu’après la fin de la partie.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Supprimer le compte définitivement" })).toBeTruthy();
  });
});
