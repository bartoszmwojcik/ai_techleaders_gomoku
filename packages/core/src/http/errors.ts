import type { ApiErrorBody, FieldErrors } from "./api-result";

export interface AppErrorOptions {
  /** Overrides the default machine-readable code of the error class. */
  code?: string;
  fieldErrors?: FieldErrors;
  /** Extra machine-readable context for the client, e.g. the id of a conflicting game. */
  data?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  readonly data?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: FieldErrors,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.data = data;
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (this.fieldErrors) {
      body.fieldErrors = this.fieldErrors;
    }
    if (this.data) {
      body.data = this.data;
    }
    return body;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(400, options.code ?? "VALIDATION", message, options.fieldErrors, options.data);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(401, options.code ?? "UNAUTHORIZED", message, options.fieldErrors, options.data);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(403, options.code ?? "FORBIDDEN", message, options.fieldErrors, options.data);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(404, options.code ?? "NOT_FOUND", message, options.fieldErrors, options.data);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(409, options.code ?? "CONFLICT", message, options.fieldErrors, options.data);
  }
}

export class GoneError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(410, options.code ?? "GONE", message, options.fieldErrors, options.data);
  }
}

export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: AppErrorOptions & { retryAfterSeconds?: number } = {},
  ) {
    super(429, options.code ?? "RATE_LIMITED", message, options.fieldErrors, options.data);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
