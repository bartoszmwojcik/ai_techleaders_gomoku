// @vitest-environment jsdom
// Field errors in French (E15-S07, package C5; spec 2026-11-13-e15-completion, Phase 5 step 5): every local check of
// `CLIENT_PARSE_SITES` shows the French text of its code, and so does the server's refusal of a field (by
// `fieldIssues`); an older server's answer without codes falls back to its Polish `fieldErrors`.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, refresh, fullPageLoad } = vi.hoisted(() => ({ apiCall: vi.fn(), refresh: vi.fn(), fullPageLoad: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("@/lib/full-page-load", () => ({ fullPageLoad }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

import frErrors from "@/i18n/catalogs/fr/errors";
import plAccount from "@/i18n/catalogs/pl/account";
import plHome from "@/i18n/catalogs/pl/home";
import { CLIENT_PARSE_SITES } from "@/i18n/error-inventory";

import { ChangeDisplayNameForm } from "./account/change-display-name-form";
import { ChangeEmailForm } from "./account/change-email-form";
import { ChangePasswordForm } from "./account/change-password-form";
import { DeleteAccountForm } from "./account/delete-account-form";
import { ForgotPasswordForm } from "./forgot-password/forgot-password-form";
import { JoinActions } from "./invite/[code]/join-actions";
import { WatchActions } from "./invite/[code]/watch-actions";
import { LoginForm } from "./login/login-form";
import { GuestCreateForm } from "./play/guest-create-form";
import { RegisterForm } from "./register/register-form";
import { ResetPasswordForm } from "./reset-password/reset-password-form";

const errorTexts = { locale: "fr", dict: frErrors } as const;
const F = frErrors.field;
const fail = (error: Record<string, unknown>) => ({ ok: false, error: { message: "Polski komunikat", ...error } });

const submit = (container: HTMLElement) => act(async () => void fireEvent.submit(container.querySelector("form")!));
const click = (name: string) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));
const type = (container: HTMLElement, selector: string, value: string) =>
  fireEvent.change(container.querySelector<HTMLInputElement>(selector)!, { target: { value } });
const shows = (text: string) => expect(document.body.textContent).toContain(text);

/** How each form of the inventory is brought to a local refusal, and the French texts it must show then. */
const LOCAL: Record<string, { mount: () => ReactElement; act: (container: HTMLElement) => Promise<void>; texts: string[] }> = {
  "app/(frontend)/login/login-form.tsx": {
    mount: () => <LoginForm nextPath="/" errorTexts={errorTexts} />,
    act: submit,
    texts: [F.email.invalid_format, F.password.too_small],
  },
  "app/(frontend)/register/register-form.tsx": {
    mount: () => <RegisterForm nextPath="/" errorTexts={errorTexts} />,
    act: submit,
    texts: [F.email.invalid_format, F.displayName.too_small.replace("{count}", "3"), F.password.PASSWORD_TOO_SHORT.replace("{count}", "8")],
  },
  "app/(frontend)/forgot-password/forgot-password-form.tsx": {
    mount: () => <ForgotPasswordForm errorTexts={errorTexts} />,
    act: submit,
    texts: [F.email.invalid_format],
  },
  "app/(frontend)/reset-password/reset-password-form.tsx": {
    mount: () => <ResetPasswordForm token={"t".repeat(43)} errorTexts={errorTexts} />,
    act: submit,
    texts: [F.newPassword.PASSWORD_TOO_SHORT.replace("{count}", "8")],
  },
  "app/(frontend)/account/change-email-form.tsx": {
    mount: () => <ChangeEmailForm errorTexts={errorTexts} />,
    act: submit,
    texts: [F.newEmail.invalid_format, F.currentPassword.too_small],
  },
  "app/(frontend)/account/change-display-name-form.tsx": {
    mount: () => <ChangeDisplayNameForm displayName="Ala_123" availableAt={null} errorTexts={errorTexts} />,
    act: async (container) => {
      type(container, 'input[name="displayName"]', "admin");
      await submit(container);
    },
    texts: [F.displayName.DISPLAY_NAME_RESERVED],
  },
  "app/(frontend)/account/change-password-form.tsx": {
    mount: () => <ChangePasswordForm errorTexts={errorTexts} />,
    act: submit,
    texts: [F.currentPassword.too_small, F.newPassword.PASSWORD_TOO_SHORT.replace("{count}", "8")],
  },
  "app/(frontend)/play/guest-create-form.tsx": {
    mount: () => <GuestCreateForm errorTexts={errorTexts} />,
    act: async (container) => {
      type(container, "#guest-nickname", "x".repeat(30));
      await submit(container);
    },
    texts: [F.nickname.NICKNAME_TOO_LONG.replace("{count}", "24")],
  },
  "app/(frontend)/invite/[code]/join-actions.tsx": {
    mount: () => <JoinActions code="ABCD-EFGH" mode="visitor" errorTexts={errorTexts} />,
    act: async (container) => {
      await click(plHome.joinActions.playAsGuest);
      type(container, "#invite-nickname", "Admin");
      await click(plHome.joinActions.confirmGuest);
    },
    texts: [F.nickname.NICKNAME_RESERVED],
  },
  "app/(frontend)/invite/[code]/watch-actions.tsx": {
    mount: () => <WatchActions code="ABCD-EFGH" signedIn={false} errorTexts={errorTexts} />,
    act: async (container) => {
      type(container, "#watch-nickname", "a<b");
      await click(plHome.watch.watch);
    },
    texts: [F.nickname.NICKNAME_INVALID],
  },
};

beforeEach(() => {
  apiCall.mockReset();
  refresh.mockReset();
  fullPageLoad.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("local checks in French", () => {
  it("covers every local check of the inventory", () => {
    expect(Object.keys(LOCAL).sort()).toEqual(CLIENT_PARSE_SITES.map(({ file }) => file).sort());
  });

  it.each(Object.entries(LOCAL))("%s", async (_file, { mount, act: refuse, texts }) => {
    const { container } = render(mount());
    await refuse(container);

    for (const text of texts) shows(text);
    expect(apiCall).not.toHaveBeenCalled();
  });
});

describe("the server's refusal of a field in French", () => {
  it("translates a taken name at registration by its code", async () => {
    apiCall.mockResolvedValue(
      fail({ code: "CONFLICT", fieldErrors: { displayName: ["Ta nazwa gracza jest już zajęta."] }, fieldIssues: { displayName: [{ code: "DISPLAY_NAME_TAKEN" }] } }),
    );
    const { container } = render(<RegisterForm nextPath="/" errorTexts={errorTexts} />);
    type(container, "#register-email", "ala@example.com");
    type(container, "#register-display-name", "Ala_123");
    type(container, "#register-password", "long-enough");
    await submit(container);

    shows(F.displayName.DISPLAY_NAME_TAKEN);
  });

  it("translates a taken name, a wrong password and a guest-only nickname on the other forms", async () => {
    apiCall.mockResolvedValue(
      fail({ code: "CONFLICT", fieldErrors: { displayName: ["Ta nazwa gracza jest już zajęta."] }, fieldIssues: { displayName: [{ code: "DISPLAY_NAME_TAKEN" }] } }),
    );
    const name = render(<ChangeDisplayNameForm displayName="Ala_123" availableAt={null} errorTexts={errorTexts} />);
    type(name.container, 'input[name="displayName"]', "Ola_456");
    await submit(name.container);
    shows(F.displayName.DISPLAY_NAME_TAKEN);
    cleanup();

    apiCall.mockResolvedValue(
      fail({
        code: "INVALID_CURRENT_PASSWORD",
        fieldErrors: { currentPassword: ["Obecne hasło jest nieprawidłowe."] },
        fieldIssues: { currentPassword: [{ code: "INVALID_CURRENT_PASSWORD" }] },
      }),
    );
    const email = render(<ChangeEmailForm errorTexts={errorTexts} />);
    type(email.container, 'input[type="email"]', "ola@example.com");
    type(email.container, 'input[type="password"]', "secret123");
    await submit(email.container);
    shows(F.currentPassword.INVALID_CURRENT_PASSWORD);
    cleanup();

    apiCall.mockResolvedValue(
      fail({ code: "VALIDATION", fieldErrors: { nickname: ["Nick podaje tylko gość."] }, fieldIssues: { nickname: [{ code: "NICKNAME_GUEST_ONLY" }] } }),
    );
    const watch = render(<WatchActions code="ABCD-EFGH" signedIn={false} errorTexts={errorTexts} />);
    await click(plHome.watch.watch);
    shows(F.nickname.NICKNAME_GUEST_ONLY);
    expect(watch.container.textContent).not.toContain("Nick podaje tylko gość.");
  });

  it("translates a wrong password when deleting the account", async () => {
    apiCall.mockResolvedValue(
      fail({ code: "INVALID_PASSWORD", fieldErrors: { password: ["Nieprawidłowe hasło."] }, fieldIssues: { password: [{ code: "INVALID_PASSWORD" }] } }),
    );
    render(<DeleteAccountForm displayName="Ala_123" currentGame={null} errorTexts={errorTexts} />);
    fireEvent.change(screen.getByLabelText(/^Hasło/), { target: { value: "secret123" } });
    await act(async () => void fireEvent.click(screen.getByRole("checkbox")));
    await act(async () => void fireEvent.click(screen.getByTestId("delete-account-submit")));
    await click(plAccount.delete.submit);

    shows(F.password.INVALID_PASSWORD);
  });

  it("keeps the Polish fieldErrors of a server that sends no codes", async () => {
    apiCall.mockResolvedValue(fail({ code: "VALIDATION", fieldErrors: { nickname: ["Polski komunikat serwera."] } }));
    render(<WatchActions code="ABCD-EFGH" signedIn={false} errorTexts={errorTexts} />);
    await click(plHome.watch.watch);

    shows("Polski komunikat serwera.");
  });
});
