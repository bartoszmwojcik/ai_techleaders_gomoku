import { safeNextPath } from "@gomoku/core";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
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

  const auth = await getI18n("auth");
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{auth.t("login.heading")}</h1>
      <LoginForm
        nextPath={nextPath}
        {...clientI18n(auth)}
        commonTexts={clientI18n(await getI18n("common"))}
        errorTexts={clientI18n(await getI18n("errors"))}
      />
    </main>
  );
}
