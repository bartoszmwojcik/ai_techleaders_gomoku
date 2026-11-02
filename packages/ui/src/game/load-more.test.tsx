// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoadMore } from "./load-more";

afterEach(cleanup);

const text = {
  label: "Pokaż starsze",
  retryLabel: "Spróbuj ponownie",
  errorTitle: "Nie udało się wczytać",
  errorMessage: "Sprawdź połączenie.",
  doneMessage: "To już wszystkie.",
};

describe("LoadMore", () => {
  it("calls back on click in the idle state", () => {
    const onLoadMore = vi.fn();
    render(<LoadMore status="idle" onLoadMore={onLoadMore} {...text} className="x" data-testid="more" />);
    expect(screen.getByTestId("more").textContent).toBe("Pokaż starsze");
    const button = screen.getByRole("button", { name: "Pokaż starsze" });
    expect(button.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the button focusable but busy while loading and ignores clicks", () => {
    const onLoadMore = vi.fn();
    render(<LoadMore status="loading" onLoadMore={onLoadMore} {...text} />);
    const button = screen.getByRole("button", { name: "Pokaż starsze" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("shows an alert and a retry button after a failure", () => {
    const onLoadMore = vi.fn();
    render(<LoadMore status="error" onLoadMore={onLoadMore} {...text} />);
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się wczytać");
    expect(screen.getByRole("alert").textContent).toContain("Sprawdź połączenie.");
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("replaces the button with a closing note when the list has ended", () => {
    const { container } = render(<LoadMore status="done" onLoadMore={vi.fn()} {...text} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("To już wszystkie.");
  });

  it("renders nothing when done without a note", () => {
    const { container } = render(<LoadMore status="done" onLoadMore={vi.fn()} {...text} doneMessage={undefined} />);
    expect(container.innerHTML).toBe("");
  });
});
