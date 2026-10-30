import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./join-actions", () => ({
  JoinActions: ({ code, mode }: { code: string; mode: string }) => <div data-testid="actions" data-code={code} data-mode={mode} />,
}));

import { InviteScreen } from "./invite-screen";

type View = Parameters<typeof InviteScreen>[0]["view"];
const render = (view: View, code = "ABCD-EFGH") => renderToStaticMarkup(<InviteScreen code={code} view={view} />);

describe("InviteScreen", () => {
  it("invites a visitor by the creator's name and offers the visitor choices (s07.1)", () => {
    const html = render({ kind: "joinable", creatorName: "Ala_7", creatorKind: "account", signedIn: false });
    expect(html).toContain("Ala_7 zaprasza Cię do partii Gomoku</h1>");
    expect(html).toContain("Kod zaproszenia: ABCD-EFGH.");
    expect(html).toContain("10 minut na gracza");
    expect(html).toContain('data-mode="visitor"');
    expect(html).toContain('data-code="ABCD-EFGH"');
  });

  it("offers a signed-in player to join (s07.3)", () => {
    expect(render({ kind: "joinable", creatorName: "Ala_7", creatorKind: "account", signedIn: true })).toContain('data-mode="member"');
  });

  it("names the creator neutrally when the account is gone", () => {
    expect(render({ kind: "joinable", creatorName: null, creatorKind: "account", signedIn: false })).toContain("Gracz zaprasza Cię");
  });

  it("tells a player with a game in progress to finish it and links to it (s07.6)", () => {
    const html = render({ kind: "has-active-game", creatorName: "Ala_7", creatorKind: "account", gameId: "g9", signedIn: true });
    expect(html).toContain("Masz już partię");
    expect(html).toContain("Dokończ ją, zanim dołączysz do kolejnej.");
    expect(html).toContain('href="/games/g9"');
    expect(html).not.toContain('data-testid="actions"');
  });

  it("lets a player with an own waiting game swap it (s07.7, Q18)", () => {
    const html = render({ kind: "has-own-waiting-game", creatorName: "Ala_7", creatorKind: "account", gameId: "g9", signedIn: true });
    expect(html).toContain("Masz oczekującą partię");
    expect(html).toContain("musisz najpierw anulować swoją");
    expect(html).toContain('data-mode="swap"');
    expect(html).toContain('href="/games/g9"');
  });

  it("explains the spent lookup pool without naming the code (s07.8)", () => {
    const html = render({ kind: "limit" }, "");
    expect(html).toContain("Zaproszenie do partii</h1>");
    expect(html).toContain("Zbyt wiele prób — spróbuj za chwilę");
    expect(html).not.toContain("Kod zaproszenia:");
    expect(html).not.toContain('data-testid="actions"');
  });

  it("gives one answer for every invalid invitation (s07.9)", () => {
    const html = render({ kind: "invalid" }, "");
    expect(html).toContain("To zaproszenie jest już nieważne</h1>");
    expect(html).toContain("Użyte, wygasłe albo anulowane.");
    expect(html).toContain('href="/join"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain("Kod zaproszenia:");
  });

  it("exposes the state for tests", () => {
    expect(render({ kind: "invalid" })).toContain('data-state="invalid"');
  });
});
