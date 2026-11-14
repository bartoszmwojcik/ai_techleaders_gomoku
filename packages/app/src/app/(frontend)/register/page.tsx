import { safeNextPath } from "@gomoku/core";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
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

  const auth = await getI18n("auth");
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{auth.t("register.heading")}</h1>
      <RegisterForm nextPath={nextPath} {...clientI18n(auth)} 
        commonTexts={clientI18n(await getI18n("common"))}
        errorTexts={clientI18n(await getI18n("errors"))}
      />
    </main>
  );
}
