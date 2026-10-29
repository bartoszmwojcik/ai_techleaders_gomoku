// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { JoinForm } from "./join-form";

beforeEach(() => push.mockReset());
afterEach(cleanup);

async function submit(value: string) {
  const user = userEvent.setup();
  render(<JoinForm />);
  const input = screen.getByLabelText(/Kod zaproszenia/);
  if (value) await user.type(input, value);
  await user.click(screen.getByRole("button", { name: "Dalej" }));
  return { user, input };
}

describe("JoinForm", () => {
  it("describes the field for typing by hand", () => {
    render(<JoinForm />);
    const input = screen.getByLabelText(/Kod zaproszenia/);
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("inputmode")).toBe("text");
    expect(screen.getByText(/Wielkość liter i myślnik nie mają znaczenia/)).toBeTruthy();
  });

  it.each([
    ["ABCD-EFGH"],
    ["abcdefgh"],
    ["  abcd efgh "],
    ["ab-cd-ef-gh"],
  ])("normalizes %j and opens the invitation page, staying pending", async (value) => {
    await submit(value);
    expect(push).toHaveBeenCalledExactlyOnceWith("/invite/ABCD-EFGH");
    expect((screen.getByRole("button", { name: "Sprawdzanie kodu…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("passes an eight-character code with odd symbols on for the uniform answer, encoded", async () => {
    await submit("ab/0?!%o");
    expect(push).toHaveBeenCalledWith("/invite/AB%2F0-%3F!%25O");
  });

  it.each([[""], ["ABC"], ["ABCD-EFGHJ"]])("rejects %j with the shape message and focuses the field", async (value) => {
    const { input } = await submit(value);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Sprawdź kod: ma 8 znaków.")).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the error after a corrected attempt", async () => {
    const { user, input } = await submit("ABC");
    await user.clear(input);
    await user.type(input, "ABCDEFGH");
    await user.click(screen.getByRole("button", { name: "Dalej" }));
    expect(screen.queryByText("Sprawdź kod: ma 8 znaków.")).toBeNull();
    expect(push).toHaveBeenCalledWith("/invite/ABCD-EFGH");
  });

  it("ignores a second submit while pending", async () => {
    await submit("ABCDEFGH");
    // A second submit event that arrives before the disabled button is rendered.
    fireEvent.submit(screen.getByTestId("join-form"));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("sends one navigation for two submits in the same tick", async () => {
    render(<JoinForm />);
    await userEvent.setup().type(screen.getByLabelText(/Kod zaproszenia/), "ABCDEFGH");
    const form = screen.getByTestId("join-form");
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("unlocks the form when the page comes back from the back/forward cache", async () => {
    await submit("ABCDEFGH");
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    const button = screen.getByRole("button", { name: "Dalej" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await userEvent.setup().click(button);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("stays locked on a pageshow that is not a cache restore", async () => {
    await submit("ABCDEFGH");
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });
    expect((screen.getByRole("button", { name: "Sprawdzanie kodu…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
