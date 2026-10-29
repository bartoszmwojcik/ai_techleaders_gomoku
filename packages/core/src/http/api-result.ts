export type FieldErrors = Record<string, string[]>;

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  /** Extra context of the error, e.g. `{ gameId }` of a conflicting game. */
  data?: Record<string, unknown>;
  /** Set by the client from the `Retry-After` header of a `429` (never sent in the body). */
  retryAfterSeconds?: number;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody };
