// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChoiceGroup } from "./choice-group";

const options = [
  { value: "classic", label: "Klasyczny" },
  { value: "paper", label: "Papier i ołówek" },
];

afterEach(cleanup);

describe("ChoiceGroup", () => {
  it("renders a labelled radio group with touch-sized choices", () => {
    const html = renderToStaticMarkup(
      <ChoiceGroup label="Wariant" options={options} value="classic" onValueChange={() => {}} data-testid="variant" className="mt-2" />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Wariant");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-testid="variant-paper"');
    expect(html).toContain("min-h-target");
    expect(html).toContain("mt-2");
  });

  it("leaves out the test ids when none is given", () => {
    expect(renderToStaticMarkup(<ChoiceGroup label="A" options={options} value="paper" onValueChange={() => {}} />)).not.toContain("data-testid");
  });

  it("reports the picked value and can be disabled", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<ChoiceGroup label="Wariant" options={options} value="classic" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Papier i ołówek" }));
    expect(onValueChange).toHaveBeenCalledWith("paper");

    rerender(<ChoiceGroup label="Wariant" options={options} value="classic" onValueChange={onValueChange} disabled />);
    expect(screen.getByRole("radio", { name: "Klasyczny" }).hasAttribute("data-disabled")).toBe(true);
  });
});
