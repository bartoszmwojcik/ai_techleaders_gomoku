import { Panel } from "@gomoku/ui/game/panel";
import { StatusBadge } from "@gomoku/ui/game/status-badge";
import { TextLink } from "@gomoku/ui/game/text-link";
import { connection } from "next/server";

import { LogoutButton } from "@/components/auth/logout-button";
import { VerifyEmailNotice } from "@/components/auth/verify-email-banner";
import { withRequestScope } from "@/server/container";
import { requirePageSession } from "@/server/http/auth";

import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";

export default async function AccountPage() {
  // Reads the session cookie and the database, so the page is rendered per request.
  await connection();
  const user = await requirePageSession("/account");
  // The slot the account holds: it decides the logout confirmation and what the deletion says.
  const currentGame = await withRequestScope(({ cradle }) =>
    cradle.gameParticipation.currentGame(user.id),
  );
  const hasActiveGame = currentGame?.status === "active";

  const verified = user.emailVerifiedAt !== null;

  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Konto</h1>
      {!verified && <VerifyEmailNotice userId={user.id} email={user.email} />}
      <Panel title="Dane konta">
        <p className="m-0 text-body">
          Nazwa gracza: <strong className="font-strong" data-testid="account-name">{user.displayName}</strong>
        </p>
        <p className="m-0 flex flex-wrap items-center gap-group text-body">
          E-mail: <strong className="font-strong" data-testid="account-email">{user.email}</strong>
          <StatusBadge status={verified ? "success" : "warning"}>
            {verified ? "Potwierdzony" : "Niepotwierdzony"}
          </StatusBadge>
        </p>
        <LogoutButton hasActiveGame={hasActiveGame} />
      </Panel>
      <Panel title="Zmień hasło">
        <ChangePasswordForm />
      </Panel>
      <DeleteAccountForm
        displayName={user.displayName}
        currentGame={currentGame && { gameId: currentGame.gameId, status: currentGame.status }}
      />
      <TextLink href="/" placement="standalone">
        Wróć na stronę główną
      </TextLink>
    </main>
  );
}
