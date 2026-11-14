import { TextLink } from "@gomoku/ui/game/text-link";

import { clientI18n, getI18n } from "@/i18n/server";

import { JoinForm } from "./join-form";

export default async function JoinPage() {
  const home = await getI18n("home");
  const { t } = home;
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{t("join.heading")}</h1>
      <JoinForm {...clientI18n(home)} />
      <p className="m-0 text-body text-text-secondary">
        <TextLink href="/" placement="standalone">
          {t("shared.backHome")}
        </TextLink>
      </p>
    </main>
  );
}
