import { redirect } from "next/navigation";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";

import { getCurrentUser } from "@/server/http/auth";

import { ForgotPasswordForm } from "./forgot-password-form";

/**
 * Asks for a password reset link. A signed-in player has no use for it (the password is
 * changed on `/account`), so they are sent there.
 */
export default async function ForgotPasswordPage() {
  await connection();
  if (await getCurrentUser()) redirect("/account");

  const auth = await getI18n("auth");
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{auth.t("forgot.heading")}</h1>
      <ForgotPasswordForm {...clientI18n(auth)} 
        commonTexts={clientI18n(await getI18n("common"))}
        errorTexts={clientI18n(await getI18n("errors"))}
      />
    </main>
  );
}
