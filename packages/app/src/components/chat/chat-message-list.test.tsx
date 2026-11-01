// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { ChatMessageList } from "./chat-message-list";

const message = (id: number, text = `tekst ${id}`, seat: 1 | 2 = 2) => ({ id, seat, text, createdAt: "2026-11-01T10:00:00.000Z" });
const labelOf = (seat: 1 | 2) => (seat === 1 ? "Ty (Ala_7)" : "Kuba_P");
const list = () => screen.getByRole("log");

afterEach(cleanup);

function layout(element: HTMLElement, { scrollHeight, clientHeight, scrollTop }: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
  element.scrollTop = scrollTop;
}

describe("ChatMessageList, what it shows", () => {
  it("is a polite log of additions and, while empty, says what to do next", () => {
    render(<ChatMessageList messages={[]} labelOf={labelOf} />);
    expect(screen.getByText("Nikt jeszcze nic nie napisał. Napisz pierwszy.")).toBeTruthy();
    expect(list().getAttribute("aria-live")).toBe("polite");
    expect(list().getAttribute("aria-relevant")).toBe("additions");
    expect(list().getAttribute("aria-label")).toBe("Wiadomości czatu");
    expect(screen.queryAllByTestId("chat-message")).toHaveLength(0);
  });

  it("lists the sender, the time (hidden from the reader's announcements) and the text of each message", () => {
    render(<ChatMessageList messages={[message(1, "Cześć", 2), message(2, "Hej", 1)]} labelOf={labelOf} />);

    const items = screen.getAllByTestId("chat-message");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Kuba_P");
    expect(items[1]!.textContent).toContain("Ty (Ala_7)");
    const time = items[0]!.querySelector("time")!;
    expect(time.getAttribute("aria-hidden")).toBe("true");
    expect(time.getAttribute("datetime")).toBe("2026-11-01T10:00:00.000Z");
    expect(time.textContent).toMatch(/^\d\d:\d\d$/);
    expect(screen.queryByText("Nikt jeszcze nic nie napisał. Napisz pierwszy.")).toBeNull();
  });

  it("shows markup, links and bidi marks as plain text, with dir=auto", () => {
    const html = '<img src=x onerror="alert(1)"> <a href="https://x.pl">x</a> \u05E9\u05DC\u05D5\u05DD';
    render(<ChatMessageList messages={[message(1, html)]} labelOf={labelOf} />);

    const text = screen.getByText(/onerror/);
    expect(text.textContent).toBe(html);
    expect(text.getAttribute("dir")).toBe("auto");
    expect(text.style.unicodeBidi).toBe("isolate");
    expect(document.querySelector("img, a")).toBeNull();
  });

  it("shows a message on its way dimmed and hidden from assistive technology", () => {
    render(<ChatMessageList messages={[]} labelOf={labelOf} pending={{ text: "w drodze", seat: 1 }} />);
    const pending = screen.getByTestId("chat-pending");
    expect(pending.getAttribute("aria-hidden")).toBe("true");
    expect(pending.textContent).toContain("w drodze");
    expect(pending.textContent).toContain("Ty (Ala_7)");
    expect(screen.queryByText("Nikt jeszcze nic nie napisał. Napisz pierwszy.")).toBeNull();
  });

  it("renders on the server", () => {
    expect(renderToStaticMarkup(<ChatMessageList messages={[message(1)]} labelOf={labelOf} />)).toContain("tekst 1");
  });
});

describe("ChatMessageList, scrolling", () => {
  it("follows the newest message while the reader is at the bottom", () => {
    const view = render(<ChatMessageList messages={[message(1)]} labelOf={labelOf} />);
    layout(list(), { scrollHeight: 500, clientHeight: 100, scrollTop: 400 });
    fireEvent.scroll(list());

    view.rerender(<ChatMessageList messages={[message(1), message(2)]} labelOf={labelOf} />);

    expect(list().scrollTop).toBe(500);
    expect(screen.queryByRole("button", { name: "Nowe wiadomości" })).toBeNull();
  });

  it("does not move a reader who scrolled up, offers 'Nowe wiadomości', and the button jumps to the bottom", () => {
    const view = render(<ChatMessageList messages={[message(1)]} labelOf={labelOf} />);
    layout(list(), { scrollHeight: 500, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(list());

    view.rerender(<ChatMessageList messages={[message(1), message(2)]} labelOf={labelOf} />);
    expect(list().scrollTop).toBe(0);
    const jump = screen.getByRole("button", { name: "Nowe wiadomości" });

    fireEvent.click(jump);
    expect(list().scrollTop).toBe(500);
    expect(screen.queryByRole("button", { name: "Nowe wiadomości" })).toBeNull();
  });

  it("drops the button when the reader scrolls down by hand, and offers nothing for a change that adds no message", () => {
    const view = render(<ChatMessageList messages={[message(1)]} labelOf={labelOf} />);
    layout(list(), { scrollHeight: 500, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(list());
    view.rerender(<ChatMessageList messages={[message(1)]} labelOf={labelOf} pending={{ text: "x", seat: 1 }} />);
    expect(screen.queryByRole("button", { name: "Nowe wiadomości" })).toBeNull();

    view.rerender(<ChatMessageList messages={[message(1), message(2)]} labelOf={labelOf} />);
    expect(screen.getByRole("button", { name: "Nowe wiadomości" })).toBeTruthy();
    act(() => {
      list().scrollTop = 395;
      fireEvent.scroll(list());
    });
    expect(screen.queryByRole("button", { name: "Nowe wiadomości" })).toBeNull();
  });
});
