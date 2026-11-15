import { describe, expect, it } from "vitest";

import {
  CSP_NONCE_REQUEST_HEADER,
  RESOURCE_CONTENT_SECURITY_POLICY,
  createCspNonce,
  pageContentSecurityPolicy,
} from "./content-security-policy";

function directives(policy: string): Record<string, string> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

describe("pageContentSecurityPolicy", () => {
  it("lets only scripts with the request's nonce run in production", () => {
    const policy = directives(pageContentSecurityPolicy({ nonce: "abc123==", dev: false }));

    expect(policy).toEqual({
      "default-src": "'self'",
      "script-src": "'self' 'nonce-abc123==' 'strict-dynamic'",
      "style-src": "'self' 'unsafe-inline'",
      "img-src": "'self' blob: data:",
      "font-src": "'self'",
      "connect-src": "'self'",
      "object-src": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "frame-ancestors": "'none'",
    });
  });

  it("adds 'unsafe-eval' to scripts in development only", () => {
    const policy = directives(pageContentSecurityPolicy({ nonce: "n", dev: true }));

    expect(policy["script-src"]).toBe("'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval'");
  });

  it("never allows inline scripts without the nonce", () => {
    for (const dev of [false, true]) {
      expect(directives(pageContentSecurityPolicy({ nonce: "n", dev }))["script-src"]).not.toContain("'unsafe-inline'");
    }
  });
});

describe("RESOURCE_CONTENT_SECURITY_POLICY", () => {
  it("allows nothing to load, frame, post or set a base, and sandboxes the document", () => {
    expect(directives(RESOURCE_CONTENT_SECURITY_POLICY)).toEqual({
      "default-src": "'none'",
      "frame-ancestors": "'none'",
      "base-uri": "'none'",
      "form-action": "'none'",
      sandbox: "",
    });
  });
});

describe("CSP_NONCE_REQUEST_HEADER", () => {
  it("is the header the Next guide uses", () => {
    expect(CSP_NONCE_REQUEST_HEADER).toBe("x-nonce");
  });
});

describe("createCspNonce", () => {
  it("returns 128 random bits in base64, different every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createCspNonce()));

    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(atob(nonce)).toHaveLength(16);
    }
  });
});
