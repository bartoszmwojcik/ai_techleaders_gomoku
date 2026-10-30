import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { getCurrentUser } from "@/server/http/auth";

import { GuestCreateForm } from "./guest-create-form";

export const metadata: Metadata = { title: "Zagraj ze znajomym bez konta — Gomoku" };

/**
 * p08 `/play` (E02-S08): a visitor without an account creates a game here. A signed-in user
 * creates from the home page, so they only get a pointer back (the role table of the map).
 */
export default async function PlayPage() {
  // Reads the session cookie: rendered per request.
  await connection();
  const user = await getCurrentUser();
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Zagraj ze znajomym bez konta</h1>
      {user ? (
        <>
          <Alert status="info" title="Jesteś zalogowany">
            Zaproszenie utworzysz na stronie głównej, przyciskiem „Utwórz zaproszenie”.
          </Alert>
          <div>
            <Button asChild>
              <Link href="/">Wróć na stronę główną</Link>
            </Button>
          </div>
        </>
      ) : (
        <GuestCreateForm />
      )}
    </main>
  );
}
