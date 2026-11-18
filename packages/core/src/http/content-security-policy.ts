/**
 * Content Security Policy for the app's pages (spec: Next 16 guide "Content Security Policy", nonce variant).
 *
 * Scripts run only with the per-request nonce; `'strict-dynamic'` lets the nonce-carrying Next runtime load its own
 * chunks, so no host allow-list is needed. Styles keep `'unsafe-inline'`: React `style` attributes and Next's injected
 * styles carry no nonce, and an injected style cannot run code. Everything else is same-origin only (the QR code is an
 * `<img>` of the app's own route), and the page may not be framed (with `X-Frame-Options: DENY` for old browsers).
 */
export function pageContentSecurityPolicy({ nonce, dev }: { nonce: string; dev: boolean }): string {
  return [
    "default-src 'self'",
    // React rebuilds server error stacks with `eval` in development only (the guide's note).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Policy for responses that are never a page (API, Next's assets): nothing may load or run, should one be opened as a
 * document (an SVG QR code, an error body), it is sandboxed, and nothing may frame it. A browser applies a response's
 * policy only to documents and workers, so the scripts and styles our pages load are unaffected. Next's config headers
 * replace a route handler's header of the same name, so this one also stands for the QR route's own `sandbox` policy.
 */
export const RESOURCE_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";

/** Request header through which the proxy hands the page's nonce to server components. */
export const CSP_NONCE_REQUEST_HEADER = "x-nonce";

/** A fresh, unpredictable nonce: 128 random bits in base64 (valid in a CSP `'nonce-…'` source). */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
