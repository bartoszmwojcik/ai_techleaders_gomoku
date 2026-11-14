import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";

import type { GameVariant } from "@gomoku/core";
import { defaultNicknameSeat } from "@gomoku/core/games/nickname";

import plCommon from "@/i18n/catalogs/pl/common";
import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps, type TranslatorOf } from "@/i18n/client";
import type { ErrorTexts } from "@/lib/api-error-text";
import { rulesLabel, type HomeTranslator } from "@/lib/games/settings";
import type { InvitationView } from "@/server/http/invitation-view";

import { JoinActions } from "./join-actions";
import { WatchActions } from "./watch-actions";

type Props = {
  /** The invitation code in its display form, `ABCD-EFGH`. */
  code: string;
  /** Any view except `redirect` and `review`, which the page handles before rendering. */
  view: Exclude<InvitationView, { kind: "redirect" | "review" }>;
  /** The `home` namespace from the server (`clientI18n`): nothing in Polish. Also handed to the client buttons. */
  texts?: TextsProps<"home">;
  /** The `common` namespace (the default guest name), the same way. */
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors of the buttons), the same way. */
  errorTexts?: ErrorTexts;
};

/**
 * A guest creator's name as the reader sees it (Q11): without a nickname it comes from the server as the Polish default
 * ("Gracz 1"), which is translated (a missing one too). Only the guest seat goes through this: an account's name is
 * shown as it is, even if it reads "Gracz 1".
 */
function guestCreatorName(name: string | null, common: TranslatorOf<"common">): string {
  const seat = name === null ? 1 : defaultNicknameSeat(name);
  return seat === null ? name! : common("player.guestDefault", { seat });
}

function heading(view: Props["view"], t: HomeTranslator, common: TranslatorOf<"common">): string {
  if (view.kind === "invalid") return t("invite.heading.invalid");
  if (view.kind === "limit") return t("invite.heading.limit");
  if (view.kind === "watch") return t("invite.heading.watch");
  // s07.11: a guest creator is "{nick} (gość)". `null` is only a deleted account, never a guest: the
  // kind decides. The account may be gone, or the page cannot name it: a neutral word, never a guess.
  if (view.creatorKind === "guest") return t("invite.heading.guestCreator", { name: guestCreatorName(view.creatorName, common) });
  return t("invite.heading.creator", { name: view.creatorName ?? t("invite.heading.someone") });
}

/** s07: the invitation page in each of its states (map s07.1-s07.9). */
export function InviteScreen({ code, view, texts = {}, commonTexts = {}, errorTexts }: Props) {
  const t = textsOf<"home">(plHome, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const open = view.kind !== "invalid" && view.kind !== "limit";
  // The variant of the game, once the view carries it; an older view means the classic game.
  const { variant = "classic", timeControlMs = 600_000 } = view as { variant?: GameVariant; timeControlMs?: number };
  return (
    <main
      className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section"
      data-testid="invite-page"
      data-state={view.kind}
    >
      <h1 className="m-0 text-section font-strong">{heading(view, t, common)}</h1>
      {open && (
        <p className="m-0 text-meta text-text-muted">
          {t("invite.codeLine", { code, rules: rulesLabel(variant, timeControlMs, t) })}
        </p>
      )}

      {open && view.isPublic && (
        <div data-testid="invite-public">
          <Alert status="info" title={t("invite.public")} />
        </div>
      )}

      {view.kind === "joinable" && <JoinActions code={code} mode={view.signedIn ? "member" : "visitor"} errorTexts={errorTexts} {...texts} />}

      {view.kind === "watch" && (
        <>
          <p className="m-0 text-body" data-testid="invite-watch-note">
            {t("invite.watchNote")}
          </p>
          <WatchActions code={code} signedIn={view.signedIn} errorTexts={errorTexts} {...texts} />
        </>
      )}

      {view.kind === "has-active-game" && (
        <>
          <Alert status="warning" title={t("shared.activeGame.title")}>
            {t("invite.oneGame")}
          </Alert>
          <TextLink href={`/games/${view.gameId}`} placement="standalone">
            {t("invite.backToOwn")}
          </TextLink>
        </>
      )}

      {view.kind === "has-own-waiting-game" && (
        <>
          <Alert status="warning" title={t("shared.ownWaiting")}>
            {t("invite.swapFirst")}
          </Alert>
          <JoinActions code={code} mode={view.signedIn ? "swap" : "swap-guest"} {...texts} />
          <TextLink href={`/games/${view.gameId}`} placement="standalone">
            {t("invite.backToOwn")}
          </TextLink>
        </>
      )}

      {view.kind === "limit" && (
        <Alert status="danger" title={t("shared.tooManyAttempts.title")}>
          {t("shared.tooManyAttempts.body")}
        </Alert>
      )}

      {view.kind === "invalid" && (
        <>
          <Alert status="danger" title={t("invite.invalidTitle")}>
            {t("invite.invalidBody")}
          </Alert>
          <div className="flex flex-wrap items-center gap-group">
            <Button asChild variant="secondary">
              <a href="/join">{t("shared.haveCode")}</a>
            </Button>
            <TextLink href="/" placement="standalone">
              {t("shared.backHome")}
            </TextLink>
          </div>
        </>
      )}
    </main>
  );
}
