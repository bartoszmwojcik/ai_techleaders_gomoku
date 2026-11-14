import { ZodError, type z } from "zod";

import type { FieldErrors, FieldIssue, FieldIssueParam, FieldIssues } from "./api-result";
import { ValidationError } from "./errors";

/** Key under which issues that are not tied to a single field are reported. */
export const FORM_ERROR_KEY = "_form";

/**
 * Closed list of Zod 4 issue codes. A new Zod code breaks `typecheck` here (the object must
 * satisfy `Record<code, …>`) before it reaches production; `unknown` is the runtime safety net.
 */
const ZOD_ISSUE_CODES = {
  invalid_type: true,
  too_big: true,
  too_small: true,
  invalid_format: true,
  not_multiple_of: true,
  unrecognized_keys: true,
  invalid_union: true,
  invalid_key: true,
  invalid_element: true,
  invalid_value: true,
  custom: true,
} satisfies Record<z.core.$ZodIssue["code"], true>;

/** Issue keys that may travel in `params`; everything else (input, path, patterns, keys, values…) is dropped. */
const PARAM_KEYS = [
  "origin",
  "minimum",
  "maximum",
  "inclusive",
  "exact",
  "format",
  "expected",
  "divisor",
] as const;

/** Keys a custom rule may expose in `params` (explicit allowlist; anything else is dropped). */
const CUSTOM_PARAM_KEYS = [...PARAM_KEYS, "min", "max", "length"] as const;

/** Codes whose structure is data of the input or of the schema, so they never carry params. */
const CODES_WITHOUT_PARAMS = new Set(["invalid_union", "unrecognized_keys"]);

function scalar(value: unknown): FieldIssueParam | undefined {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : undefined;
    case "bigint":
      return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(value)
        : undefined;
    default:
      return value instanceof Date ? value.getTime() : undefined;
  }
}

function pick(source: Record<string, unknown>, keys: readonly string[]): FieldIssue["params"] {
  const params: Record<string, FieldIssueParam> = {};
  for (const key of keys) {
    const value = scalar(source[key]);
    if (value !== undefined) params[key] = value;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function toFieldIssue(issue: z.core.$ZodIssue): FieldIssue {
  const raw = issue as unknown as Record<string, unknown>;
  if (issue.code === "custom") {
    const custom = (raw.params ?? {}) as Record<string, unknown>;
    const code = typeof custom.code === "string" ? custom.code : "custom";
    const params = pick(custom, CUSTOM_PARAM_KEYS);
    return params ? { code, params } : { code };
  }
  if (!(issue.code in ZOD_ISSUE_CODES)) return { code: "unknown" };
  if (CODES_WITHOUT_PARAMS.has(issue.code)) return { code: issue.code };
  const params = pick(raw, PARAM_KEYS);
  return params ? { code: issue.code, params } : { code: issue.code };
}

function keyOf(issue: z.core.$ZodIssue): string {
  return issue.path.length > 0 ? issue.path.join(".") : FORM_ERROR_KEY;
}

/**
 * Machine-readable counterpart of `fieldErrors`: same keys and same order, but each entry is a
 * stable `code` (native Zod 4 code, or `params.code` of a custom rule) with scalar `params`.
 * Pure, so client-side `safeParse` yields the same codes as the server.
 */
export function toFieldIssues(error: ZodError): FieldIssues {
  const fieldIssues: FieldIssues = {};
  for (const issue of error.issues) {
    (fieldIssues[keyOf(issue)] ??= []).push(toFieldIssue(issue));
  }
  return fieldIssues;
}

/**
 * Converts a `ZodError` into a `ValidationError` whose `fieldErrors` are keyed by the
 * dotted issue path (top-level issues go under `FORM_ERROR_KEY`) and whose `fieldIssues`
 * carry the codes. Any other value yields `undefined`, so callers can fall through to
 * their own handling.
 */
export function toValidationError(error: unknown): ValidationError | undefined {
  if (!(error instanceof ZodError)) return undefined;
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    (fieldErrors[keyOf(issue)] ??= []).push(issue.message);
  }
  return new ValidationError("Popraw zaznaczone pola.", {
    fieldErrors,
    fieldIssues: toFieldIssues(error),
  });
}
