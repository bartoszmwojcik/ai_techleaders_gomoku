// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentConnectCard, type AgentConnectCardProps } from "./agent-connect-card";

afterEach(cleanup);

function renderCard(props: Partial<AgentConnectCardProps> = {}) {
  const onCopyCommand = vi.fn();
  const onCopyCode = vi.fn();
  const { container } = render(
    <AgentConnectCard
      summary="Jak podłączyć agenta"
      commandIntro="Uruchom polecenie"
      command="claude mcp add --transport http gomoku https://gomoku.example/api/mcp"
      copyCommandLabel="Kopiuj polecenie"
      checkText="Wpisz /mcp"
      codeIntro="Powiedz agentowi"
      code="ABCD-EFGH"
      copyCodeLabel="Kopiuj kod"
      serverLabel="Adres serwera"
      serverUrl="https://gomoku.example/api/mcp"
      copiedLabel="Skopiowano"
      onCopyCommand={onCopyCommand}
      onCopyCode={onCopyCode}
      {...props}
    />,
  );
  return { container, onCopyCommand, onCopyCode };
}

describe("AgentConnectCard", () => {
  it("is collapsed by default and shows the summary", () => {
    const { container } = renderCard();
    expect(container.querySelector("details")!.open).toBe(false);
    expect(screen.getByText("Jak podłączyć agenta")).toBeTruthy();
  });

  it("can start expanded", () => {
    const { container } = renderCard({ defaultOpen: true });
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("shows the command, the code and the server address", () => {
    renderCard({ defaultOpen: true, className: "extra" });
    expect(screen.getByText("claude mcp add --transport http gomoku https://gomoku.example/api/mcp")).toBeTruthy();
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("Adres serwera")).toBeTruthy();
    expect(screen.getByText("https://gomoku.example/api/mcp")).toBeTruthy();
    expect(screen.getByText("Wpisz /mcp")).toBeTruthy();
    expect(screen.queryByText("Uwaga")).toBeNull();
  });

  it("shows the closing note when given", () => {
    renderCard({ defaultOpen: true, note: "Uwaga" });
    expect(screen.getByText("Uwaga")).toBeTruthy();
  });

  it("calls the matching handler for each copy button", async () => {
    const user = userEvent.setup();
    const { onCopyCommand, onCopyCode } = renderCard({ defaultOpen: true });
    await user.click(screen.getByRole("button", { name: "Kopiuj polecenie" }));
    expect(onCopyCommand).toHaveBeenCalledTimes(1);
    expect(onCopyCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Kopiuj kod" }));
    expect(onCopyCode).toHaveBeenCalledTimes(1);
  });

  it("marks only the copied text and announces it", () => {
    renderCard({ defaultOpen: true, copied: "command" });
    expect(screen.getByRole("button", { name: "Skopiowano" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kopiuj kod" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Skopiowano");
    cleanup();
    renderCard({ defaultOpen: true, copied: "code" });
    expect(screen.getByRole("button", { name: "Kopiuj polecenie" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skopiowano" })).toBeTruthy();
  });

  it("announces nothing before anything is copied", () => {
    renderCard({ defaultOpen: true });
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
