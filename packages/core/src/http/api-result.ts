export type FieldErrors = Record<string, string[]>;

/** A scalar value a field issue may carry (never user input, never schema structure). */
export type FieldIssueParam = string | number | boolean;

/** Machine-readable counterpart of one `fieldErrors` entry: a stable code plus scalar params. */
export interface FieldIssue {
  code: string;
  params?: Record<string, FieldIssueParam>;
}

/** Same keys and order as `FieldErrors`; lets the client translate field errors by `code`. */
export type FieldIssues = Record<string, FieldIssue[]>;

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  /** Additive: codes of the `fieldErrors` entries (same keys, same order). */
  fieldIssues?: FieldIssues;
  /** Extra context of the error, e.g. `{ gameId }` of a conflicting game. */
  data?: Record<string, unknown>;
  /** Set by the client from the `Retry-After` header of a `429` (never sent in the body). */
  retryAfterSeconds?: number;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody };
