// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { DismissibleNotice } from "./dismissible-notice";

afterEach(cleanup);

describe("DismissibleNotice", () => {
  it("shows the message and hides it after the close button", async () => {
    render(
      <DismissibleNotice title="Zaproszenie anulowane" closeLabel="Zamknij">
        Link jest już nieważny.
      </DismissibleNotice>,
    );
    expect(screen.getByRole("status").textContent).toContain("Link jest już nieważny.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
