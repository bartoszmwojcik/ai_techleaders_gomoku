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

  it("draws neutral joined segments: a tick and a strong border on the checked one, no action colour", () => {
    const html = renderToStaticMarkup(<ChoiceGroup label="Wariant" options={options} value="paper" onValueChange={() => {}} />);

    expect(html).not.toContain("action-primary");
    expect(html).toContain("data-[state=checked]:border-segment-checked-border");
    expect(html).toContain("data-[state=checked]:bg-segment-checked-bg");
    expect(html).toContain("data-[state=checked]:font-strong");
    expect(html).toContain("focus-visible:focus-ring-inset");
    expect(html).toContain("text-meta");
    // Only the checked segment carries a tick, and it is hidden from assistive technology.
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
  });

  it("puts up to two options in one row and more in two columns on a phone", () => {
    const three = [...options, { value: "x", label: "Trzecia" }];
    const two = renderToStaticMarkup(<ChoiceGroup label="A" options={options} value="classic" onValueChange={() => {}} />);
    const many = renderToStaticMarkup(<ChoiceGroup label="A" options={three} value="classic" onValueChange={() => {}} />);

    expect(two).toContain("grid-flow-col");
    expect(two).not.toContain("grid-cols-2");
    expect(many).toContain("grid-cols-2");
    expect(many).toContain("sm:grid-flow-col");
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
