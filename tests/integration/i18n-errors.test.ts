// Error codes on the built app (E15-S07, package C5; spec 2026-11-13-e15-completion, Phase 5): a refused field carries
// its code in the additive `fieldIssues` next to the unchanged Polish `fieldErrors`, and a code with several messages
// tells them apart by `data.reason`, the Polish `message` unchanged. The French texts of these codes are rendered by
// the forms (`c5-texts.test.tsx`); here only the envelope the server sends is checked.
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let addressCounter = 0;
const nextAddress = () => `198.91.0.${++addressCounter}`;

function post(path: string, body: unknown, headers: Record<string, string> = { origin: baseUrl }) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...headers },
    body: JSON.stringify(body),
  });
}

type ErrorBody = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    fieldIssues?: Record<string, { code: string; params?: Record<string, unknown> }[]>;
    data?: Record<string, unknown>;
  };
};

describe("field codes in the error envelope", () => {
  it("sends the codes of a refused registration next to the Polish messages", async () => {
    const response = await post("/api/auth/register", { email: "nie-email", displayName: "ab", password: "short" });

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as ErrorBody;
    expect(error.code).toBe("VALIDATION");
    expect(error.message).toBe("Popraw zaznaczone pola.");
    expect(error.fieldErrors).toEqual({
      email: ["Podaj poprawny adres e-mail."],
      displayName: ["Nazwa gracza musi mieć co najmniej 3 znaki."],
      password: ["Hasło musi mieć co najmniej 8 znaków."],
    });
    expect(error.fieldIssues).toEqual({
      email: [{ code: "invalid_format", params: { origin: "string", format: "email" } }],
      displayName: [{ code: "too_small", params: { origin: "string", minimum: 3, inclusive: true } }],
      password: [{ code: "PASSWORD_TOO_SHORT", params: { min: 8 } }],
    });
    // Never the input itself.
    expect(JSON.stringify(error.fieldIssues)).not.toContain("nie-email");
  });

  it("sends the code of a guest's nickname that is too long", async () => {
    const response = await post("/api/games", { acknowledgedGuestWarning: true, nickname: "x".repeat(30) });

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as ErrorBody;
    expect(error.fieldErrors?.nickname).toEqual(["Nick może mieć najwyżej 24 znaków."]);
    expect(error.fieldIssues?.nickname).toEqual([{ code: "NICKNAME_TOO_LONG", params: { max: 24 } }]);
  });
});

describe("data.reason of a code with several messages", () => {
  it("tells a refused request without its origin apart, the message unchanged", async () => {
    const response = await post("/api/auth/register", {}, { origin: "https://example.com" });

    expect(response.status).toBe(403);
    const { error } = (await response.json()) as ErrorBody;
    expect(error).toEqual({ code: "FORBIDDEN", message: "Żądanie odrzucone.", data: { reason: "request_rejected" } });
  });
});
