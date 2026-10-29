import { safeNextPath } from "@gomoku/core";
import { connection } from "next/server";

import { getCurrentUser } from "@/server/http/auth";

import { ConfirmEmail } from "./confirm-email";

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string | string[]; next?: string | string[] }>;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Landing page of the link from the verification e-mail. Opening it changes nothing
 * (mail scanners open links, Q3): it only shows the button that sends the confirmation.
 * The token is in the address, so the response carries `Referrer-Policy: no-referrer`
 * (`next.config.ts`). Works signed in or not: the token alone proves access to the mailbox.
 */
export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  await connection();
  const params = await searchParams;
  const token = first(params.token) || undefined;
  const nextPath = safeNextPath(first(params.next));
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <ConfirmEmail
        token={token}
        nextPath={nextPath}
        signedIn={user !== null}
        alreadyVerified={user?.emailVerifiedAt != null}
      />
    </main>
  );
}
