import {
  AppError,
  ForbiddenError,
  TooManyRequestsError,
  ValidationError,
  toValidationError,
  type ApiResult,
} from "@gomoku/core";

import { getContainer } from "../container";
import type { ServerConfig } from "../config";
import { describeError } from "./describe-error";

/** Header every state-changing request must carry (set by `apiCall`); a second CSRF layer. */
export const CSRF_HEADER = "x-gomoku-request";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

/** What a route function returns; `apiHandler` turns it into the `{ ok: true, data }` envelope. */
export type ApiSuccess<T> = { data: T; status?: number };

function forbidden(): ForbiddenError {
  return new ForbiddenError("Żądanie odrzucone.");
}

/**
 * CSRF protection (G2): the `Origin` header is mandatory and must equal `APP_ORIGIN`
 * exactly (outside production without `APP_ORIGIN`: `http://localhost:<port>`), and the
 * custom `X-Gomoku-Request` header must be present. `Host` is deliberately not used: a
 * proxy may rewrite it.
 */
export function assertSameOrigin(
  request: Request,
  config: Pick<ServerConfig, "appOrigin">,
): void {
  const origin = request.headers.get("origin");
  const allowed =
    config.appOrigin === undefined
      ? origin !== null && LOCALHOST_ORIGIN.test(origin)
      : origin === config.appOrigin;
  if (!allowed || !request.headers.has(CSRF_HEADER)) throw forbidden();
}

/** Parses a JSON request body; anything unparsable is a `400`, never a `500`. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Nieprawidłowe dane żądania.");
  }
}

function errorResponse(error: AppError): Response {
  const body: ApiResult<never> = { ok: false, error: error.toBody() };
  const headers = new Headers();
  if (
    error instanceof TooManyRequestsError &&
    error.retryAfterSeconds !== undefined
  ) {
    headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return Response.json(body, { status: error.status, headers });
}

/**
 * Wraps a route function: applies CSRF protection to state-changing methods, wraps the
 * result in the `{ ok, data | error }` envelope and maps `AppError` and `ZodError` to their
 * status. Unknown errors become a generic `500` (logged, never leaked to the client).
 * Every `/api/*` route except `/api/health` must go through it.
 */
export function apiHandler<T, Args extends unknown[] = []>(
  fn: (request: Request, ...args: Args) => Promise<ApiSuccess<T>>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    try {
      if (STATE_CHANGING_METHODS.has(request.method)) {
        const container = await getContainer();
        assertSameOrigin(request, container.cradle.serverConfig);
      }
      const { data, status = 200 } = await fn(request, ...args);
      const body: ApiResult<T> = { ok: true, data };
      return Response.json(body, { status });
    } catch (error) {
      const appError =
        error instanceof AppError ? error : toValidationError(error);
      if (appError) return errorResponse(appError);
      // Name and code only: the message of a database error may contain the query with PII.
      console.error("Unhandled API error", describeError(error));
      return errorResponse(
        new AppError(500, "INTERNAL", "Wystąpił nieoczekiwany błąd."),
      );
    }
  };
}
