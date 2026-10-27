import { ZodError } from "zod";

import type { FieldErrors } from "./api-result";
import { ValidationError } from "./errors";

/** Key under which issues that are not tied to a single field are reported. */
export const FORM_ERROR_KEY = "_form";

/**
 * Converts a `ZodError` into a `ValidationError` whose `fieldErrors` are keyed by the
 * dotted issue path (top-level issues go under `FORM_ERROR_KEY`). Any other value yields
 * `undefined`, so callers can fall through to their own handling.
 */
export function toValidationError(error: unknown): ValidationError | undefined {
  if (!(error instanceof ZodError)) return undefined;
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : FORM_ERROR_KEY;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return new ValidationError("Popraw zaznaczone pola.", { fieldErrors });
}
