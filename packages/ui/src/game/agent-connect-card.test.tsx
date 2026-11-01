// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentConnectCard, type AgentConnectCardProps } from "./agent-connect-card";

afterEach(cleanup);

function renderCard(props: Partial<AgentConnectCardProps> = {}) {
  const onCopySnippet = vi.fn();
  const onCopyCode = vi.fn();
  const onClientChange = vi.fn();
  const { container } = render(
    <AgentConnectCard
      summary="Jak podłączyć agenta"
      clientLabel="Klient"
      clients={[
        { value: "claude-code", label: "Claude Code" },
        { value: "cursor", label: "Cursor" },
      ]}
      client="claude-code"
      onClientChange={onClientChange}
      snippetIntro="Uruchom polecenie"
      snippet="claude mcp add --transport http gomoku https://gomoku.example/api/mcp"
      copySnippetLabel="Kopiuj polecenie"
      checkText="Wpisz /mcp"
      codeIntro="Powiedz agentowi"
      code="ABCD-EFGH"
      copyCodeLabel="Kopiuj kod"
      serverLabel="Adres serwera"
      serverUrl="https://gomoku.example/api/mcp"
      copiedLabel="Skopiowano"
      onCopySnippet={onCopySnippet}
      onCopyCode={onCopyCode}
      {...props}
    />,
  );
  return { container, onCopySnippet, onCopyCode, onClientChange };
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
    const { container } = renderCard({ defaultOpen: true, className: "extra" });
    expect(container.querySelector('[data-copy="snippet"]')!.textContent).toBe(
      "claude mcp add --transport http gomoku https://gomoku.example/api/mcp",
    );
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("Adres serwera")).toBeTruthy();
    expect(screen.getByText("https://gomoku.example/api/mcp")).toBeTruthy();
    expect(screen.getByText("Wpisz /mcp")).toBeTruthy();
    expect(screen.queryByText("Uwaga")).toBeNull();
  });

  it("shows the snippet whole in one block and keeps option words unbreakable", () => {
    const text = "claude mcp add --transport http gomoku https://gomoku.example/api/mcp";
    const { container } = renderCard({ defaultOpen: true });
    const block = container.querySelector('[data-copy="snippet"]')!;
    expect(block.textContent).toBe(text);
    expect(block.className).toContain("break-words");
    expect(block.className).toContain("no-ligatures");
    expect(block.className).not.toContain("break-all");
    expect([...block.querySelectorAll("span.whitespace-nowrap")].map((span) => span.textContent)).toEqual(["--transport"]);
    expect(container.innerHTML).not.toContain("break-all");
  });

  it("keeps a multi-line snippet with its indentation", () => {
    const text = '{\n  "mcpServers": {\n    "gomoku": {}\n  }\n}';
    const { container } = renderCard({ defaultOpen: true, snippet: text });
    expect(container.querySelector('[data-copy="snippet"]')!.textContent).toBe(text);
    expect(container.querySelector('[data-copy="snippet"]')!.className).toContain("whitespace-pre-wrap");
  });

  it("offers the client choice and reports a change", async () => {
    const user = userEvent.setup();
    const { onClientChange } = renderCard({ defaultOpen: true });
    const select = screen.getByRole("combobox", { name: "Klient" }) as HTMLSelectElement;
    expect(select.value).toBe("claude-code");
    expect([...select.options].map((option) => option.textContent)).toEqual(["Claude Code", "Cursor"]);
    await user.selectOptions(select, "cursor");
    expect(onClientChange).toHaveBeenCalledWith("cursor");
  });

  it("shows the closing note when given", () => {
    renderCard({ defaultOpen: true, note: "Uwaga" });
    expect(screen.getByText("Uwaga")).toBeTruthy();
  });

  it("calls the matching handler for each copy button", async () => {
    const user = userEvent.setup();
    const { onCopySnippet, onCopyCode } = renderCard({ defaultOpen: true });
    await user.click(screen.getByRole("button", { name: "Kopiuj polecenie" }));
    expect(onCopySnippet).toHaveBeenCalledTimes(1);
    expect(onCopyCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Kopiuj kod" }));
    expect(onCopyCode).toHaveBeenCalledTimes(1);
  });

  it("marks only the copied text and announces it", () => {
    renderCard({ defaultOpen: true, copied: "snippet" });
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
