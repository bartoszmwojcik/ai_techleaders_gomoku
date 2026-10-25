// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PasswordField, type PasswordFieldProps } from "./password-field";

afterEach(cleanup);

function renderField(props: Partial<PasswordFieldProps> = {}) {
  return render(
    <PasswordField
      label="Hasło"
      showLabel="Pokaż hasło"
      hideLabel="Ukryj hasło"
      autoComplete="current-password"
      {...props}
    />,
  );
}

describe("PasswordField", () => {
  it("hides the password by default and names the field and the toggle", () => {
    renderField({ name: "password", className: "max-w-sm" });

    const input = screen.getByLabelText("Hasło") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("current-password");
    expect(input.name).toBe("password");
    const toggle = screen.getByRole("button", { name: "Pokaż hasło" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("reveals and hides the password with the toggle", async () => {
    const user = userEvent.setup();
    renderField({ autoComplete: "new-password", defaultValue: "tajne-haslo-123" });

    const input = screen.getByLabelText("Hasło") as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("tajne-haslo-123");
    expect(screen.getByRole("button", { name: "Ukryj hasło" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Ukryj hasło" }));
    expect(input.type).toBe("password");
  });

  it("reports typed text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ onChange });

    await user.type(screen.getByLabelText("Hasło"), "ab");

    expect(onChange).toHaveBeenLastCalledWith("ab");
  });

  it("works uncontrolled without a change handler", async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByLabelText("Hasło"), "ab");

    expect((screen.getByLabelText("Hasło") as HTMLInputElement).value).toBe("ab");
  });

  it("shows the hint, the requirement and the error through the field", () => {
    renderField({ hint: "Co najmniej 16 znaków", error: "Hasło jest za krótkie: dodaj znaki.", requirement: "(wymagane)", required: true });

    const input = screen.getByLabelText(/Hasło/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(screen.getByText("(wymagane)")).toBeTruthy();
    expect(input.getAttribute("aria-describedby")).toContain("-error");
  });

  it("uses the given id so a form can focus it", () => {
    renderField({ id: "login-password" });

    expect(screen.getByLabelText("Hasło").id).toBe("login-password");
  });

  it("can be controlled from outside", () => {
    renderField({ value: "z-zewnatrz", onChange: () => undefined });

    expect((screen.getByLabelText("Hasło") as HTMLInputElement).value).toBe("z-zewnatrz");
  });
});
