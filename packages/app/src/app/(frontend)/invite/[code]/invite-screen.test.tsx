import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./watch-actions", () => ({
  WatchActions: ({ code, signedIn }: { code: string; signedIn: boolean }) => (
    <div data-testid="watch-actions" data-code={code} data-signed-in={String(signedIn)} />
  ),
}));
vi.mock("./join-actions", () => ({
  JoinActions: ({ code, mode, locale }: { code: string; mode: string; locale?: string }) => (
    <div data-testid="actions" data-code={code} data-mode={mode} data-locale={locale} />
  ),
}));

import frCommon from "@/i18n/catalogs/fr/common";
import frHome from "@/i18n/catalogs/fr/home";

import { InviteScreen } from "./invite-screen";

type View = Parameters<typeof InviteScreen>[0]["view"];
const render = (view: View, code = "ABCD-EFGH") => renderToStaticMarkup(<InviteScreen code={code} view={view} />);

describe("InviteScreen", () => {
  it("invites a visitor by the creator's name and offers the visitor choices (s07.1)", () => {
    const html = render({ kind: "joinable", creatorName: "Ala_7", creatorKind: "account", isPublic: false, signedIn: false });
    expect(html).toContain("Ala_7 zaprasza Cię do partii Gomoku</h1>");
    expect(html).toContain("Kod zaproszenia: ABCD-EFGH.");
    expect(html).toContain("10 minut na gracza");
    expect(html).toContain('data-mode="visitor"');
    expect(html).toContain('data-code="ABCD-EFGH"');
  });

  it("tells the invitee before joining that a public game can be watched by anyone with the code (BR-45)", () => {
    const html = render({ kind: "joinable", creatorName: "Ala_7", creatorKind: "account", isPublic: true, signedIn: false });
    expect(html).toContain("Partia publiczna: może ją oglądać każdy z kodem");
    expect(html).toContain('data-testid="invite-public"');
  });

  it("says nothing about publicity for a private game or an invalid code", () => {
    expect(render({ kind: "joinable", creatorName: "Ala_7", creatorKind: "account", isPublic: false, signedIn: false })).not.toContain("Partia publiczna");
    expect(render({ kind: "invalid" })).not.toContain("Partia publiczna");
  });

  it("offers a game in progress to be watched: no join, the audience notice and the watch button (E10-S02)", () => {
    const html = render({ kind: "watch", isPublic: true, creatorName: "Ala_7", creatorKind: "account", gameId: "g1", signedIn: true });
    expect(html).toContain("Ta partia już trwa</h1>");
    expect(html).toContain("Obaj gracze są już w partii. Możesz ją oglądać na żywo");
    expect(html).toContain("Partia publiczna: może ją oglądać każdy z kodem");
    expect(html).toContain('data-testid="watch-actions" data-code="ABCD-EFGH" data-signed-in="true"');
    expect(html).not.toContain('data-testid="actions"');
    expect(html).toContain('data-state="watch"');
  });

  it("offers a signed-in player to join (s07.3)", () => {
    expect(render({ kind: "joinable", creatorName: "Ala_7", creatorKind: "account", isPublic: false, signedIn: true })).toContain('data-mode="member"');
  });

  it("names a guest creator with the suffix (s07.11), by the default name when there is no nickname", () => {
    const html = render({ kind: "joinable", creatorName: "Ala", creatorKind: "guest", isPublic: false, signedIn: false });
    expect(html).toContain("Ala (gość) zaprasza Cię do partii Gomoku</h1>");
    expect(render({ kind: "joinable", creatorName: null, creatorKind: "guest", isPublic: false, signedIn: false })).toContain(
      "Gracz 1 (gość) zaprasza Cię",
    );
  });

  it("names the creator neutrally when the account is gone", () => {
    expect(render({ kind: "joinable", creatorName: null, creatorKind: "account", isPublic: false, signedIn: false })).toContain("Gracz zaprasza Cię");
  });

  it("tells a player with a game in progress to finish it and links to it (s07.6)", () => {
    const html = render({ kind: "has-active-game", creatorName: "Ala_7", creatorKind: "account", isPublic: false, gameId: "g9", signedIn: true });
    expect(html).toContain("Masz już partię");
    expect(html).toContain("Dokończ ją, zanim dołączysz do kolejnej.");
    expect(html).toContain('href="/games/g9"');
    expect(html).not.toContain('data-testid="actions"');
  });

  it("lets a player with an own waiting game swap it (s07.7, Q18)", () => {
    const html = render({ kind: "has-own-waiting-game", creatorName: "Ala_7", creatorKind: "account", isPublic: false, gameId: "g9", signedIn: true });
    expect(html).toContain("Masz oczekującą partię");
    expect(html).toContain("musisz najpierw anulować swoją");
    expect(html).toContain('data-mode="swap"');
    expect(html).toContain('href="/games/g9"');
  });

  it("lets a guest creator swap the own waiting game, still as a guest (s07.7, L35)", () => {
    const html = render({ kind: "has-own-waiting-game", creatorName: "Ala", creatorKind: "guest", isPublic: false, gameId: "g9", signedIn: false });
    expect(html).toContain('data-mode="swap-guest"');
    expect(html).not.toContain('data-mode="swap"');
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

describe("InviteScreen, variant (E11)", () => {
  it("names the paper variant and its clock instead of the classic rules", () => {
    const view = { kind: "joinable", creatorName: "Ala_7", creatorKind: "account", isPublic: false, signedIn: false, variant: "paper", timeControlMs: 180_000 } as View;
    const html = render(view);
    expect(html).toContain("Papier i ołówek · 3 min na gracza.");
    expect(html).not.toContain("plansza 15×15");
  });
});

describe("InviteScreen in French (E15-S03)", () => {
  const fr = (view: View, code = "ABCD-EFGH") =>
    renderToStaticMarkup(
      <InviteScreen code={code} view={view} texts={{ locale: "fr", dict: frHome }} commonTexts={{ locale: "fr", dict: frCommon }} />,
    );

  it("translates a guest creator's default name, and only a guest's (Q11)", () => {
    const guest = fr({ kind: "joinable", creatorName: "Gracz 1", creatorKind: "guest", isPublic: true, signedIn: false });
    expect(guest).toContain("Joueur 1 (invité) vous invite à une partie de Gomoku</h1>");
    expect(guest).toContain("Code d’invitation\u202f: ABCD-EFGH. Règles libres · plateau 15×15 · 10\u00a0minutes par joueur.");
    expect(guest).toContain("Partie publique\u202f: toute personne ayant le code peut la regarder");
    expect(guest).toContain('data-mode="visitor" data-locale="fr"');
    expect(fr({ kind: "joinable", creatorName: null, creatorKind: "guest", isPublic: false, signedIn: false })).toContain("Joueur 1 (invité)");
    expect(fr({ kind: "joinable", creatorName: "Ala", creatorKind: "guest", isPublic: false, signedIn: false })).toContain("Ala (invité)");
    expect(fr({ kind: "joinable", creatorName: "Gracz 1", creatorKind: "account", isPublic: false, signedIn: false })).toContain(
      "Gracz 1 vous invite à une partie de Gomoku</h1>",
    );
    expect(fr({ kind: "joinable", creatorName: null, creatorKind: "account", isPublic: false, signedIn: false })).toContain("Un joueur vous invite");
  });

  it("words every other state", () => {
    expect(fr({ kind: "watch", isPublic: true, creatorName: "Ala", creatorKind: "account", gameId: "g1", signedIn: true })).toContain(
      "Les deux joueurs sont déjà dans la partie.",
    );
    const active = fr({ kind: "has-active-game", creatorName: "Ala", creatorKind: "account", isPublic: false, gameId: "g9", signedIn: true });
    expect(active).toContain("Vous avez déjà une partie");
    expect(active).toContain("Revenir à votre partie");
    expect(fr({ kind: "has-own-waiting-game", creatorName: "Ala", creatorKind: "account", isPublic: false, gameId: "g9", signedIn: true })).toContain(
      "vous devez d’abord annuler la vôtre",
    );
    expect(fr({ kind: "limit" }, "")).toContain("Trop de tentatives — réessayez dans un instant");
    const invalid = fr({ kind: "invalid" }, "");
    expect(invalid).toContain("Cette invitation n’est plus valable</h1>");
    expect(invalid).toContain("Vous avez un code\u202f?</a>");
    expect(invalid).not.toMatch(/[ąćęłńóśźż]/);
  });
});
