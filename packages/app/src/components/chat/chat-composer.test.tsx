// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./chat-composer";
import type { SendOutcome } from "./use-chat";

vi.setConfig({ testTimeout: 20_000 });

const send = vi.fn<(text: string, clientId: string) => Promise<SendOutcome>>();
const input = () => screen.getByLabelText("Wiadomość") as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const setup = (props: Partial<Parameters<typeof ChatComposer>[0]> = {}) =>
  render(<ChatComposer maxLength={200} blockedReason={null} send={send} {...props} />);
// The answer of `send` is a resolved promise: let its continuation run before looking at the form.
const flush = () => act(async () => void (await Promise.resolve()));
const user = () => userEvent.setup({ delay: null, advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  send.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ChatComposer, the form", () => {
  it("has a label, a counter, a send button and takes no focus", () => {
    setup();
    expect(input().getAttribute("enterkeyhint")).toBe("send");
    expect(input().getAttribute("autocomplete")).toBe("off");
    expect(input().getAttribute("dir")).toBe("auto");
    expect(input().getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Pozostało 200 znaków")).toBeTruthy();
    expect(button("Wyślij").type).toBe("submit");
    expect(document.activeElement).toBe(document.body);
  });

  it("renders on the server", () => {
    expect(renderToStaticMarkup(<ChatComposer maxLength={200} blockedReason={null} send={send} />)).toContain("Wiadomość");
  });

  it("counts code points after NFKC and speaks Polish plurals", async () => {
    setup({ maxLength: 5 });
    const u = user();
    await u.type(input(), "ab");
    expect(screen.getByText("Pozostało 3 znaki")).toBeTruthy();
    await u.type(input(), "ﬁ");
    expect(screen.getByText("Pozostało 1 znak")).toBeTruthy();
    await u.type(input(), "x");
    expect(screen.getByText("Pozostało 0 znaków")).toBeTruthy();
    await u.type(input(), "y");
    expect(screen.getByText("Za dużo o 1 znak")).toBeTruthy();
    await u.type(input(), "yz");
    expect(screen.getByText("Za dużo o 3 znaki")).toBeTruthy();
  });
});

describe("ChatComposer, sending", () => {
  it("sends on Enter, clears the field and keeps the focus in it", async () => {
    setup();
    const u = user();
    await u.type(input(), "Cześć{Enter}");
    await flush();

    expect(send).toHaveBeenCalledWith("Cześć", expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
  });

  it("keeps the focus in the field after a click on the button", async () => {
    setup();
    const u = user();
    await u.type(input(), "hej");
    await u.click(button("Wyślij"));
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input());
  });

  it("does not steal the focus when it was elsewhere when the answer came", async () => {
    let finish!: (outcome: SendOutcome) => void;
    send.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    setup();
    const u = user();
    await u.type(input(), "hej{Enter}");
    await flush();
    (document.activeElement as HTMLElement).blur();
    await act(async () => finish({ ok: true }));
    expect(document.activeElement).toBe(document.body);
  });

  it("says 'Wysyłanie…' on the button while the message is on its way", async () => {
    let finish!: (outcome: SendOutcome) => void;
    send.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    setup();
    await user().type(input(), "hej{Enter}");
    await flush();
    expect(screen.getByRole("button", { name: "Wysyłanie…" })).toBeTruthy();
    await act(async () => finish({ ok: true }));
    expect(button("Wyślij")).toBeTruthy();
  });

  it("refuses an empty message and a message with an address before asking the server", async () => {
    setup();
    const u = user();
    await u.click(button("Wyślij"));
    await flush();
    expect(screen.getByText("Wpisz wiadomość.")).toBeTruthy();
    await u.type(input(), "zobacz example.com{Enter}");
    await flush();
    expect(screen.getByText("Wiadomość nie może zawierać adresów internetowych.")).toBeTruthy();
    expect(input().value).toBe("zobacz example.com");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(send).not.toHaveBeenCalled();
    // Editing clears the error.
    await u.type(input(), "x");
    expect(screen.queryByText("Wiadomość nie może zawierać adresów internetowych.")).toBeNull();
  });

  it.each([
    ["field", { ok: false, kind: "field", message: "Wiadomość jest za długa." }],
    ["refused", { ok: false, kind: "refused", message: "Czat jest wyłączony." }],
  ] as const)("shows the server's %s sentence under the field and keeps the text", async (_kind, outcome) => {
    send.mockResolvedValueOnce(outcome);
    setup();
    await user().type(input(), "hej{Enter}");
    await flush();
    expect(screen.getByText(outcome.message)).toBeTruthy();
    expect(input().value).toBe("hej");
  });

  it("ignores a send that was a double click", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "busy" });
    setup();
    await user().type(input(), "hej{Enter}");
    await flush();
    expect(input().value).toBe("hej");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("[id$='-error']")).toBeNull();
  });

  it("blocks the button for the wait the server gave, says why, and frees it afterwards", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "wait", message: "x", retryAfterMs: 1500 });
    setup();
    await user().type(input(), "hej{Enter}");
    await flush();

    expect(screen.getByText("Poczekaj chwilę przed następną wiadomością.")).toBeTruthy();
    expect(button("Wyślij").disabled).toBe(true);
    // Enter does nothing during the wait.
    fireEvent.submit(input().closest("form")!);
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => void (await vi.advanceTimersByTimeAsync(1500)));
    expect(button("Wyślij").disabled).toBe(false);
    expect(screen.queryByText("Poczekaj chwilę przed następną wiadomością.")).toBeNull();
  });

  it("restarts the wait when it is told again and clears it on unmount", async () => {
    send.mockResolvedValue({ ok: false, kind: "wait", message: "x", retryAfterMs: 1000 });
    const view = setup();
    const u = user();
    await u.type(input(), "hej{Enter}");
    await flush();
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    fireEvent.change(input(), { target: { value: "hej2" } });
    expect(button("Wyślij").disabled).toBe(true);
    view.unmount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
  });
});

describe("ChatComposer, a lost connection", () => {
  it("keeps the text, offers 'Ponów wysyłanie' and repeats the very same attempt", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "network" });
    setup();
    const u = user();
    await u.type(input(), "hej{Enter}");
    await flush();

    expect(screen.getByText("Nie wysłano: brak połączenia.")).toBeTruthy();
    expect(input().value).toBe("hej");
    const first = send.mock.calls[0]![1];

    await u.click(button("Ponów wysyłanie"));
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(["hej", first]);
    expect(screen.queryByText("Nie wysłano: brak połączenia.")).toBeNull();
    expect(input().value).toBe("");
  });

  it("starts a new attempt when the text changes", async () => {
    send.mockResolvedValue({ ok: false, kind: "network" });
    setup();
    const u = user();
    await u.type(input(), "hej{Enter}");
    await flush();
    await u.type(input(), "!");
    expect(screen.queryByText("Nie wysłano: brak połączenia.")).toBeNull();
    await u.type(input(), "{Enter}");
    await flush();
    expect(send.mock.calls[1]![0]).toBe("hej!");
    expect(send.mock.calls[1]![1]).not.toBe(send.mock.calls[0]![1]);
  });

  it("keeps 'Ponów wysyłanie' disabled while it sends", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "network" });
    setup();
    const u = user();
    await u.type(input(), "hej{Enter}");
    await flush();
    let finish!: (outcome: SendOutcome) => void;
    send.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await u.click(button("Ponów wysyłanie"));
    await flush();
    await act(async () => finish({ ok: false, kind: "network" }));
    expect(button("Ponów wysyłanie").disabled).toBe(false);
  });
});

describe("ChatComposer, blocked", () => {
  it("disables the field and the button and says why next to them", async () => {
    setup({ blockedReason: "Wczytujemy czat…" });
    expect(input().disabled).toBe(true);
    expect(button("Wyślij").disabled).toBe(true);
    expect(screen.getByText("Wczytujemy czat…")).toBeTruthy();
    expect(screen.queryByText(/Pozostało/)).toBeNull();
    fireEvent.submit(input().closest("form")!);
    expect(send).not.toHaveBeenCalled();
  });
});
