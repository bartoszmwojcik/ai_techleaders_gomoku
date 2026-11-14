import type { Locale } from "@gomoku/core/i18n/locales";

import type { Namespace } from "./types";

/**
 * Review state of a translation (spec I17): `draft` is a machine draft that passes parity; `reviewed` names the native
 * reviewer and the day (YYYY-MM-DD). A French `draft` with no review never goes on screen in front of French guests.
 */
export type ReviewStatus = { state: "draft" } | { state: "reviewed"; reviewer: string; date: string };

const DRAFT: ReviewStatus = { state: "draft" };

export const CATALOG_STATUS: Readonly<Record<Exclude<Locale, "pl">, Readonly<Record<Namespace, ReviewStatus>>>> = {
  en: { common: DRAFT, header: DRAFT, show: DRAFT, home: DRAFT, auth: DRAFT, game: DRAFT, chat: DRAFT, lobby: DRAFT, history: DRAFT, review: DRAFT, account: DRAFT, errors: DRAFT },
  fr: { common: DRAFT, header: DRAFT, show: DRAFT, home: DRAFT, auth: DRAFT, game: DRAFT, chat: DRAFT, lobby: DRAFT, history: DRAFT, review: DRAFT, account: DRAFT, errors: DRAFT },
  de: { common: DRAFT, header: DRAFT, show: DRAFT, home: DRAFT, auth: DRAFT, game: DRAFT, chat: DRAFT, lobby: DRAFT, history: DRAFT, review: DRAFT, account: DRAFT, errors: DRAFT },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with one status: a review needs a reviewer and a valid day. */
export function statusProblems(status: ReviewStatus): string[] {
  if (status.state === "draft") return [];
  const problems: string[] = [];
  if (status.reviewer.trim() === "") problems.push("reviewer is empty");
  if (!DAY.test(status.date) || Number.isNaN(Date.parse(status.date))) problems.push(`date "${status.date}" is not YYYY-MM-DD`);
  return problems;
}
