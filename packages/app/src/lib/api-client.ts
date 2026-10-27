import type { ApiResult } from "@gomoku/core/http/api-result";

export const REQUEST_HEADER = "X-Gomoku-Request";

export interface ApiCallOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

function networkError(): ApiResult<never> {
  return { ok: false, error: { code: "network", message: "Request failed" } };
}

function isEnvelope(value: unknown): value is ApiResult<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const { ok } = value as { ok?: unknown };
  return ok === true || ok === false;
}

/**
 * The only way client code calls `/api/*`: sends the CSRF header and always
 * resolves to an `ApiResult` (network failures and non-JSON bodies become a
 * `network` error instead of throwing).
 */
export async function apiCall<T>(
  path: string,
  { method = "POST", body, signal }: ApiCallOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { [REQUEST_HEADER]: "1" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const parsed: unknown = await response.json();
    return isEnvelope(parsed) ? (parsed as ApiResult<T>) : networkError();
  } catch {
    return networkError();
  }
}
