import type { ApiErrorBody, FieldErrors } from "./api-result";

export interface AppErrorOptions {
  /** Overrides the default machine-readable code of the error class. */
  code?: string;
  fieldErrors?: FieldErrors;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (this.fieldErrors) {
      body.fieldErrors = this.fieldErrors;
    }
    return body;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(400, options.code ?? "VALIDATION", message, options.fieldErrors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(401, options.code ?? "UNAUTHORIZED", message, options.fieldErrors);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(403, options.code ?? "FORBIDDEN", message, options.fieldErrors);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(404, options.code ?? "NOT_FOUND", message, options.fieldErrors);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(409, options.code ?? "CONFLICT", message, options.fieldErrors);
  }
}

export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: AppErrorOptions & { retryAfterSeconds?: number } = {},
  ) {
    super(429, options.code ?? "RATE_LIMITED", message, options.fieldErrors);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
