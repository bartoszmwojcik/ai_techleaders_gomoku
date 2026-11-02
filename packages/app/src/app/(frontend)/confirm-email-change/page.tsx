import { connection } from "next/server";

import { ConfirmEmailChange } from "./confirm-email-change";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Landing page of the link from the e-mail-change message (E05-S01). Opening it changes nothing
 * (mail scanners open links): it only shows the button that applies the change. The token is in
 * the address, so the response carries `Referrer-Policy: no-referrer` (`next.config.ts`). Works
 * signed in or not: the token alone proves access to the new mailbox.
 */
export default async function ConfirmEmailChangePage({ searchParams }: Props) {
  await connection();
  const token = first((await searchParams).token) || undefined;
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <ConfirmEmailChange token={token} />
    </main>
  );
}
