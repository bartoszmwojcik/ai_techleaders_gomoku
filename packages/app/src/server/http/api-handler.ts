import {
  AppError,
  ForbiddenError,
  ServiceUnavailableError,
  TooManyRequestsError,
  ValidationError,
  toValidationError,
  type ApiResult,
} from "@gomoku/core";

import { getContainer } from "../container";
import type { ServerConfig } from "../config";
import { describeError } from "./describe-error";
import { logSecurityEvent } from "./security-log";

/** Header every state-changing request must carry (set by `apiCall`); a second CSRF layer. */
export const CSRF_HEADER = "x-gomoku-request";

/** Largest accepted request body of the JSON API (API4:2023); the biggest legitimate one is a chat message. `/api/mcp` has its own, smaller limit. */
export const API_BODY_MAX_BYTES = 64 * 1024;

/** Never from a cache: the answers are about one session or one game. */
const NO_STORE = "private, no-store";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

/** What a route function returns; `apiHandler` turns it into the `{ ok: true, data }` envelope. */
export type ApiSuccess<T> = { data: T; status?: number };

function forbidden(): ForbiddenError {
  return new ForbiddenError("Żądanie odrzucone.", { data: { reason: "request_rejected" } });
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
  if (!allowed || !request.headers.has(CSRF_HEADER)) {
    logSecurityEvent("csrf_rejected", { reason: allowed ? "missing_header" : "origin" });
    throw forbidden();
  }
}

function payloadTooLarge(): AppError {
  return new AppError(413, "PAYLOAD_TOO_LARGE", "Żądanie jest zbyt duże.");
}

/**
 * Reads the body as text, refusing more than `API_BODY_MAX_BYTES` with a `413` before it is
 * parsed: by the declared `Content-Length` when there is one, and always by counting the bytes
 * of the stream, so a lying or missing length (chunked) cannot get past it.
 */
async function readBodyText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > API_BODY_MAX_BYTES) throw payloadTooLarge();
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    received += value.byteLength;
    if (received > API_BODY_MAX_BYTES) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Nieprawidłowe dane żądania.");
  }
}

/** Parses a JSON request body; anything unparsable is a `400`, never a `500`, a body over the limit a `413`. */
export async function readJsonBody(request: Request): Promise<unknown> {
  return parseJson(await readBodyText(request));
}

/**
 * Like `readJsonBody`, but a request without a body is `{}`: for endpoints whose body only
 * carries optional settings. A body that is present must still be valid JSON.
 */
export async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await readBodyText(request);
  return text.trim() === "" ? {} : parseJson(text);
}

function errorResponse(error: AppError): Response {
  const body: ApiResult<never> = { ok: false, error: error.toBody() };
  const headers = new Headers({ "Cache-Control": NO_STORE });
  if (
    (error instanceof TooManyRequestsError || error instanceof ServiceUnavailableError) &&
    error.retryAfterSeconds !== undefined
  ) {
    headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return Response.json(body, { status: error.status, headers });
}

export type ApiHandlerOptions = {
  /**
   * Runs first, before the CSRF check and the route: a throw is the answer (`requireAdminApi`, whose 404 must
   * not depend on the request's headers: show-mode, "API Contracts").
   */
  gate?: () => Promise<unknown>;
};

/**
 * Wraps a route function: applies CSRF protection to state-changing methods, wraps the
 * result in the `{ ok, data | error }` envelope and maps `AppError` and `ZodError` to their
 * status. Unknown errors become a generic `500` (logged, never leaked to the client). A route
 * answering with something other than JSON (an image) returns its own `Response`, passed on as is.
 * Every `/api/*` route except `/api/health` and `/api/mcp` must go through it (`api-routes.guard.test.ts`).
 * All its answers carry `Cache-Control: private, no-store` unless the route set its own.
 */
export function apiHandler<T, Args extends unknown[] = []>(
  fn: (request: Request, ...args: Args) => Promise<ApiSuccess<T> | Response>,
  options: ApiHandlerOptions = {},
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    try {
      // Before CSRF, so whoever the gate turns away gets its answer (a 404) whatever the request carries.
      if (options.gate) await options.gate();
      if (STATE_CHANGING_METHODS.has(request.method)) {
        const container = await getContainer();
        assertSameOrigin(request, container.cradle.serverConfig);
      }
      const result = await fn(request, ...args);
      if (result instanceof Response) {
        if (!result.headers.has("Cache-Control")) result.headers.set("Cache-Control", NO_STORE);
        return result;
      }
      const { data, status = 200 } = result;
      const body: ApiResult<T> = { ok: true, data };
      return Response.json(body, { status, headers: { "Cache-Control": NO_STORE } });
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
