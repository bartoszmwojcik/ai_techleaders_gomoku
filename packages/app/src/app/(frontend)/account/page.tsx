import { Panel } from "@gomoku/ui/game/panel";
import { TextLink } from "@gomoku/ui/game/text-link";
import { connection } from "next/server";

import { LogoutButton } from "@/components/auth/logout-button";
import { withRequestScope } from "@/server/container";
import { requirePageSession } from "@/server/http/auth";

import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  // Reads the session cookie and the database, so the page is rendered per request.
  await connection();
  const user = await requirePageSession("/account");
  const hasActiveGame = await withRequestScope(({ cradle }) =>
    cradle.gameParticipation.hasActiveGame(user.id),
  );

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Konto</h1>
      <Panel title="Dane konta">
        <p className="m-0 text-body">
          Nazwa gracza: <strong className="font-strong" data-testid="account-name">{user.displayName}</strong>
        </p>
        <p className="m-0 text-body">
          E-mail: <strong className="font-strong" data-testid="account-email">{user.email}</strong>
        </p>
        <LogoutButton hasActiveGame={hasActiveGame} />
      </Panel>
      <Panel title="Zmień hasło">
        <ChangePasswordForm />
      </Panel>
      <TextLink href="/" placement="standalone">
        Wróć na stronę główną
      </TextLink>
    </main>
  );
}
