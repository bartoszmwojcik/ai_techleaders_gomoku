import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUser } from "@/server/http/auth";

import { ForgotPasswordForm } from "./forgot-password-form";

/**
 * Asks for a password reset link. A signed-in player has no use for it (the password is
 * changed on `/account`), so they are sent there.
 */
export default async function ForgotPasswordPage() {
  await connection();
  if (await getCurrentUser()) redirect("/account");

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Nie pamiętasz hasła?</h1>
      <ForgotPasswordForm />
    </main>
  );
}
