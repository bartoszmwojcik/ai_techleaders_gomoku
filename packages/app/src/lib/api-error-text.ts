import type { FieldErrors, FieldIssue, FieldIssues } from "@gomoku/core/http/api-result";
import { FORM_ERROR_KEY, toFieldIssues, toValidationError } from "@gomoku/core/http/zod-error";
import { createTranslator, isPlural, type Dict, type Params } from "@gomoku/core/i18n/translator";
import type { ZodError } from "zod";

import plErrors from "@/i18n/catalogs/pl/errors";
import type { NamespaceDict } from "@/i18n/catalogs/types";
import type { TextsProps } from "@/i18n/client";

/**
 * Texts of API errors and field errors in the reader's language (E15-S07, C5; spec 2026-11-13-e15-completion,
 * "API Contracts"). The envelope's Polish `message` and `fieldErrors` stay the fallback: a code without a text (an
 * older server, an endpoint off the player's path) still shows what the server said.
 */
export type ErrorTexts = TextsProps<"errors">;

type Resolved = { dict: NamespaceDict<"errors">; t: (key: string, params?: Params) => string };

function resolve({ locale = "pl", dict = plErrors }: ErrorTexts): Resolved {
  const translate = createTranslator(locale, dict);
  return { dict, t: (key, params) => translate(key as never, params) };
}

/** The key of a message at `path`: the message itself, or the `_` text of a group; `undefined` when neither exists. */
function messageKey(dict: Dict, path: string): string | undefined {
  let node: Dict[string] | undefined = dict;
  for (const part of path.split(".")) {
    if (node === undefined || typeof node === "string" || isPlural(node)) return undefined;
    node = node[part];
  }
  if (node === undefined) return undefined;
  if (typeof node === "string" || isPlural(node)) return path;
  // A group's own text is a plain string by the catalogs' convention.
  return typeof node._ === "string" ? `${path}._` : undefined;
}

/** The variant of a size or format rule: "at least 3", "more than 3" and "exactly 3" have keys of their own. */
function variantOf(issue: FieldIssue): string | undefined {
  const params = issue.params ?? {};
  if (issue.code === "too_small" || issue.code === "too_big") {
    if (params.exact === true) return "exact";
    if (params.inclusive === true) return "inclusive";
    if (params.inclusive === false) return "exclusive";
    return undefined;
  }
  return issue.code === "invalid_format" && typeof params.format === "string" ? params.format : undefined;
}

/** The limit of the rule as `{count}` (plural forms follow it), with every scalar parameter of the issue. */
function paramsOf(issue: FieldIssue): Params {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(issue.params ?? {})) {
    if (typeof value !== "boolean") params[key] = value;
  }
  const limit = [params.minimum, params.maximum, params.min, params.max].find((value) => typeof value === "number");
  if (limit !== undefined) params.count = limit;
  return params;
}

/**
 * The keys tried for one field issue, most specific first: the form's own text, the field's text shared by every
 * form, then the generic Zod text by origin and variant.
 */
export function fieldIssueKeys(field: string, issue: FieldIssue, form?: string): string[] {
  const keys = form ? [`fields.${form}.${field}.${issue.code}`] : [];
  keys.push(`field.${field}.${issue.code}`);
  const origin = issue.params?.origin;
  const variant = variantOf(issue);
  if (typeof origin === "string") {
    if (variant) keys.push(`zod.${issue.code}.${origin}.${variant}`);
    keys.push(`zod.${issue.code}.${origin}`);
  } else if (variant) {
    keys.push(`zod.${issue.code}.${variant}`);
  }
  keys.push(`zod.${issue.code}`);
  return keys;
}

/** The text of one field issue, or `undefined` when the catalog has none (the caller falls back to `fieldErrors`). */
export function fieldIssueText(texts: ErrorTexts, field: string, issue: FieldIssue, form?: string): string | undefined {
  const { dict, t } = resolve(texts);
  for (const key of fieldIssueKeys(field, issue, form)) {
    const found = messageKey(dict, key);
    if (found) return t(found, paramsOf(issue));
  }
  return undefined;
}

/** What a field error comes from: the envelope of a refused request, or `toValidationError` of a local check. */
export type FieldErrorSource = { fieldErrors?: FieldErrors; fieldIssues?: FieldIssues };

/**
 * The first message of each of `fields`, translated by `fieldIssues` where the catalog has a text, otherwise the
 * Polish `fieldErrors` of the same entry. Fields without an error are absent.
 */
export function fieldMessages<F extends string>(
  texts: ErrorTexts,
  fields: readonly F[],
  source: FieldErrorSource | undefined,
  form?: string,
): Partial<Record<F, string>> {
  const messages: Partial<Record<F, string>> = {};
  for (const field of fields) {
    const issue = source?.fieldIssues?.[field]?.[0];
    const message = (issue && fieldIssueText(texts, field, issue, form)) ?? source?.fieldErrors?.[field]?.[0];
    if (message) messages[field] = message;
  }
  return messages;
}

/** `fieldMessages` of a local `safeParse` failure: the same codes and the same texts as the server's answer. */
export function localFieldMessages<F extends string>(
  texts: ErrorTexts,
  fields: readonly F[],
  error: ZodError,
  form?: string,
): Partial<Record<F, string>> {
  return fieldMessages(texts, fields, toValidationError(error), form);
}

/**
 * The message of a local check of one value (a scalar schema such as `nicknameSchema`, whose issues have no path):
 * shown under `field`, translated where the catalog has a text, otherwise the schema's Polish message.
 */
export function localValueMessage(texts: ErrorTexts, field: string, error: ZodError): string {
  const issue = toFieldIssues(error)[FORM_ERROR_KEY]![0]!;
  return fieldIssueText(texts, field, issue) ?? error.issues[0]!.message;
}

/** The text of a refused request by `code` (and `data.reason`, where one code carries several messages). */
export function apiErrorText(
  texts: ErrorTexts,
  error: { code: string; message: string; data?: Record<string, unknown> },
): string {
  const { dict, t } = resolve(texts);
  const reason = error.data?.reason;
  const keys = typeof reason === "string" ? [`api.${error.code}.${reason}`, `api.${error.code}`] : [`api.${error.code}`];
  for (const key of keys) {
    const found = messageKey(dict, key);
    if (found) return t(found);
  }
  return error.message;
}
