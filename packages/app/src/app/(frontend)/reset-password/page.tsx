import { connection } from "next/server";

import { ResetPasswordForm } from "./reset-password-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

/**
 * Landing page of the link from the reset e-mail. Opening it changes nothing (mail scanners
 * open links): only the form's POST sets the password. The token is in the address, so the
 * response carries `Referrer-Policy: no-referrer` (`next.config.ts`). Works signed in or not:
 * the token alone proves access to the mailbox.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  await connection();
  const { token } = await searchParams;
  // Only the first `token` counts; an empty one is a missing one.
  const first = (Array.isArray(token) ? token[0] : token) || undefined;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Ustaw nowe hasło</h1>
      <ResetPasswordForm token={first} />
    </main>
  );
}
