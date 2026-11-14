import { Panel } from "@gomoku/ui/game/panel";
import { StatusBadge } from "@gomoku/ui/game/status-badge";
import { TextLink } from "@gomoku/ui/game/text-link";
import { connection } from "next/server";

import { LogoutButton } from "@/components/auth/logout-button";
import { VerifyEmailNotice } from "@/components/auth/verify-email-banner";
import { clientI18n, getI18n } from "@/i18n/server";
import { withRequestScope } from "@/server/container";
import { requirePageSession } from "@/server/http/auth";

import { ChangeDisplayNameForm } from "./change-display-name-form";
import { ChangeEmailForm } from "./change-email-form";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";

export default async function AccountPage() {
  // Reads the session cookie and the database, so the page is rendered per request.
  await connection();
  const user = await requirePageSession("/account");
  // The slot the account holds: it decides the logout confirmation and what the deletion says.
  const { currentGame, nameAvailableAt } = await withRequestScope(async ({ cradle }) => ({
    currentGame: await cradle.gameParticipation.currentGame(user.id),
    // E05-S01: a rename is possible once per 24 h; the form is locked until then.
    nameAvailableAt: await cradle.userService.displayNameChangeAvailableAt(user.id),
  }));
  const hasActiveGame = currentGame?.status === "active";

  const verified = user.emailVerifiedAt !== null;
  const account = await getI18n("account");
  const { t } = account;
  const texts = clientI18n(account);
  const commonTexts = clientI18n(await getI18n("common"));
  const errorTexts = clientI18n(await getI18n("errors"));

  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{t("heading")}</h1>
      {!verified && <VerifyEmailNotice userId={user.id} email={user.email} {...clientI18n(await getI18n("auth"))} />}
      <Panel title={t("data")}>
        <p className="m-0 text-body">
          {t("name")}<strong className="font-strong" data-testid="account-name">{user.displayName}</strong>
        </p>
        <p className="m-0 flex flex-wrap items-center gap-group text-body">
          {t("email")}<strong className="font-strong" data-testid="account-email">{user.email}</strong>
          <StatusBadge status={verified ? "success" : "warning"}>
            {t(verified ? "verified" : "unverified")}
          </StatusBadge>
        </p>
        <LogoutButton hasActiveGame={hasActiveGame} dict={clientI18n(await getI18n("header")).dict} />
      </Panel>
      <Panel title={t("changeName.title")}>
        <ChangeDisplayNameForm
          displayName={user.displayName}
          availableAt={nameAvailableAt?.toISOString() ?? null}
          texts={texts}
          commonTexts={commonTexts}
          errorTexts={errorTexts}
        />
      </Panel>
      <Panel title={t("changeEmail.title")}>
        <ChangeEmailForm texts={texts} commonTexts={commonTexts} errorTexts={errorTexts} />
      </Panel>
      <Panel title={t("changePassword.title")}>
        <ChangePasswordForm texts={texts} commonTexts={commonTexts} errorTexts={errorTexts} />
      </Panel>
      <DeleteAccountForm
        displayName={user.displayName}
        currentGame={currentGame && { gameId: currentGame.gameId, status: currentGame.status }}
        texts={texts}
        commonTexts={commonTexts}
        errorTexts={errorTexts}
      />
      <TextLink href="/" placement="standalone">
        {t("backHome")}
      </TextLink>
    </main>
  );
}
