import { safeNextPath } from "@gomoku/core";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUser } from "@/server/http/auth";

import { RegisterForm } from "./register-form";

type RegisterPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  await connection();
  // A signed-in player never sees the form (and `next` is ignored: there is nothing to return to).
  if (await getCurrentUser()) redirect("/");

  const { next } = await searchParams;
  // Only the first `next` counts; anything unsafe falls back to "/".
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Załóż konto</h1>
      <RegisterForm nextPath={nextPath} />
    </main>
  );
}
