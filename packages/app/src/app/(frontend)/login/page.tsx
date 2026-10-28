import { safeNextPath } from "@gomoku/core";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUser } from "@/server/http/auth";

import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await connection();
  const { next } = await searchParams;
  // Only the first `next` counts; anything unsafe falls back to "/".
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);
  // A signed-in player goes straight on to where the login was meant to lead.
  if (await getCurrentUser()) redirect(nextPath);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Zaloguj się</h1>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
