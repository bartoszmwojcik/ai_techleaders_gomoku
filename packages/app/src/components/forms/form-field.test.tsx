// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormField } from "./form-field";

afterEach(cleanup);

describe("FormField", () => {
  it("labels the input and links hint and error", () => {
    render(<FormField label="E-mail" hint="Podpowiedź" error="Błąd" requirement="(wymagane)" required id="email" name="email" />);
    const input = screen.getByLabelText(/E-mail/);
    expect(input.id).toBe("email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("email-hint email-error");
    expect(screen.getByText("Błąd")).toBeTruthy();
  });

  it("is valid and undescribed without hint and error", () => {
    render(<FormField label="Nazwa" />);
    const input = screen.getByLabelText("Nazwa");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("reports typing to onChange", async () => {
    const onChange = vi.fn();
    render(<FormField label="Nazwa" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Nazwa"), "ab");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
