import type { ApiErrorBody, FieldErrors, FieldIssues } from "./api-result";

export interface AppErrorOptions {
  /** Overrides the default machine-readable code of the error class. */
  code?: string;
  fieldErrors?: FieldErrors;
  /** Codes of the `fieldErrors` entries, for client-side translation. Additive. */
  fieldIssues?: FieldIssues;
  /** Extra machine-readable context for the client, e.g. the id of a conflicting game. */
  data?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  readonly fieldIssues?: FieldIssues;
  readonly data?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: FieldErrors,
    data?: Record<string, unknown>,
    fieldIssues?: FieldIssues,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.fieldIssues = fieldIssues;
    this.data = data;
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (this.fieldErrors) {
      body.fieldErrors = this.fieldErrors;
    }
    if (this.fieldIssues) {
      body.fieldIssues = this.fieldIssues;
    }
    if (this.data) {
      body.data = this.data;
    }
    return body;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(
      400,
      options.code ?? "VALIDATION",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(
      401,
      options.code ?? "UNAUTHORIZED",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(
      403,
      options.code ?? "FORBIDDEN",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(
      404,
      options.code ?? "NOT_FOUND",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(
      409,
      options.code ?? "CONFLICT",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
  }
}

export class GoneError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(
      410,
      options.code ?? "GONE",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
  }
}

export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: AppErrorOptions & { retryAfterSeconds?: number } = {},
  ) {
    super(
      429,
      options.code ?? "RATE_LIMITED",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** The service cannot take the request now (a feature switched off or out of resources); may carry `Retry-After`. */
export class ServiceUnavailableError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: AppErrorOptions & { retryAfterSeconds?: number } = {},
  ) {
    super(
      503,
      options.code ?? "SERVICE_UNAVAILABLE",
      message,
      options.fieldErrors,
      options.data,
      options.fieldIssues,
    );
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
