import { describe, expect, it, vi } from "vitest";

import { describeError } from "../../http/describe-error";
import {
  BREVO_SEND_URL,
  BrevoEmailSender,
  BrevoSendError,
} from "./brevo-email-sender";

const API_KEY = "xkeysib-secret-key";
const message = {
  to: "gracz@example.com",
  subject: "Potwierdź e-mail",
  text: "https://gomoku.test/verify?token=SECRET-TOKEN",
  html: '<a href="https://gomoku.test/verify?token=SECRET-TOKEN">link</a>',
};

function senderWith(fetchMock: ReturnType<typeof vi.fn>) {
  return new BrevoEmailSender({
    apiKey: API_KEY,
    fromAddress: "gra@example.com",
    fromName: "Gomoku",
    fetch: fetchMock as unknown as typeof fetch,
  });
}

function respond(
  status: number,
  body: string | null = '{"messageId":"<1@x>"}',
) {
  return vi.fn().mockResolvedValue(new Response(body, { status }));
}

async function failure(promise: Promise<void>): Promise<BrevoSendError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BrevoSendError);
  return error as BrevoSendError;
}

function expectNoLeak(error: BrevoSendError) {
  const dump = JSON.stringify([
    error.message,
    error.stack,
    error.code,
    describeError(error),
  ]);
  for (const secret of [API_KEY, "SECRET-TOKEN", "gracz@example.com"]) {
    expect(dump).not.toContain(secret);
  }
}

describe("BrevoEmailSender", () => {
  it("posts the message to the Brevo API with the expected shape", async () => {
    const fetchMock = respond(201);

    await senderWith(fetchMock).send(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(url).toBe(BREVO_SEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "api-key": API_KEY,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: "gra@example.com", name: "Gomoku" },
      to: [{ email: "gracz@example.com" }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("succeeds on 201 even without a response body", async () => {
    await expect(
      senderWith(respond(201, null)).send(message),
    ).resolves.toBeUndefined();
  });

  it.each([400, 401, 429, 500, 503, 200])(
    "rejects with a short code for HTTP %i without leaking secrets",
    async (status) => {
      const echo = `{"message":"bad ${API_KEY} gracz@example.com SECRET-TOKEN"}`;
      const error = await failure(
        senderWith(respond(status, echo)).send(message),
      );

      expect(error.code).toBe(`BREVO_HTTP_${status}`);
      expect(error.name).toBe("BrevoSendError");
      expect(describeError(error)).toEqual({
        name: "BrevoSendError",
        code: `BREVO_HTTP_${status}`,
      });
      expectNoLeak(error);
    },
  );

  it("handles an error response without a body", async () => {
    const error = await failure(senderWith(respond(500, null)).send(message));
    expect(error.code).toBe("BREVO_HTTP_500");
  });

  it("maps a network exception to BREVO_NETWORK and drops the cause", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new TypeError(
          `fetch failed for ${API_KEY} gracz@example.com SECRET-TOKEN`,
        ),
      );

    const error = await failure(senderWith(fetchMock).send(message));

    expect(error.code).toBe("BREVO_NETWORK");
    expect(error.cause).toBeUndefined();
    expectNoLeak(error);
  });

  it("maps its own timeout to BREVO_TIMEOUT", async () => {
    const timeout = new AbortController();
    const spy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);
    try {
      const fetchMock = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "TimeoutError")),
            );
          }),
      );
      const pending = failure(senderWith(fetchMock as never).send(message));
      timeout.abort();

      expect((await pending).code).toBe("BREVO_TIMEOUT");
      expect(spy).toHaveBeenCalledWith(10_000);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects when the caller's signal aborts", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("x")));
        }),
    );
    const pending = failure(
      senderWith(fetchMock as never).send(message, {
        signal: controller.signal,
      }),
    );
    controller.abort();

    expect((await pending).code).toBe("BREVO_TIMEOUT");
  });

  it("rejects immediately when the caller's signal is already aborted", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      init.signal?.aborted
        ? Promise.reject(new Error("aborted"))
        : Promise.resolve(new Response(null, { status: 201 })),
    );
    const error = await failure(
      senderWith(fetchMock as never).send(message, {
        signal: AbortSignal.abort(),
      }),
    );
    expect(error.code).toBe("BREVO_TIMEOUT");
  });
});
