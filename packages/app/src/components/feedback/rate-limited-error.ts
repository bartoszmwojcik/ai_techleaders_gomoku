import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TranslatorOf } from "@/i18n/client";

const PL_COMMON = textsOf<"common">(plCommon);

/** Title and details of the "too many attempts" message; the wait is rounded up to whole minutes. */
export function rateLimitedError(
  retryAfterSeconds: number | undefined,
  t: TranslatorOf<"common"> = PL_COMMON,
): { title: string; details: string } {
  const minutes = retryAfterSeconds === undefined ? undefined : Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    title: t("rateLimited.title"),
    details: minutes === undefined ? t("rateLimited.later") : t("rateLimited.inMinutes", { minutes: t.number(minutes) }),
  };
}
