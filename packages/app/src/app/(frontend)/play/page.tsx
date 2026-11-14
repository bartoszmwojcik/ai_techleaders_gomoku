import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/server/http/auth";
import { isBotEnabled } from "@/server/http/bot-availability";

import { GuestCreateForm } from "./guest-create-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n("home");
  return { title: t("meta.play") };
}

/**
 * p08 `/play` (E02-S08): a visitor without an account creates a game here. A signed-in user
 * creates from the home page, so they only get a pointer back (the role table of the map).
 */
export default async function PlayPage() {
  // Reads the session cookie: rendered per request.
  await connection();
  const user = await getCurrentUser();
  const home = await getI18n("home");
  const { t } = home;
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{t("play.heading")}</h1>
      {user ? (
        <>
          <Alert status="info" title={t("play.signedInTitle")}>
            {t("play.signedInBody")}
          </Alert>
          <div>
            <Button asChild>
              <Link href="/">{t("shared.backHome")}</Link>
            </Button>
          </div>
        </>
      ) : (
        <GuestCreateForm
          botEnabled={await isBotEnabled()}
          {...clientI18n(home)}
          errorTexts={clientI18n(await getI18n("errors"))}
        />
      )}
    </main>
  );
}
