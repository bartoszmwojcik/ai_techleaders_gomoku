import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { InviteCodeCard } from "@gomoku/ui/game/invite-code-card";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import { useEffect, useState } from "react";

import { go, Main, SiteHeader, useCurrentScreen, useGameRoute } from "../chrome";
import {
  accessibleGame,
  cancelInvitation,
  createGame,
  creatorOpens,
  formatValidUntil,
  opponentName,
  phaseOf,
  setNotice,
  useSim,
} from "../sim";
import { useStateId } from "../stateId";
import { GameGate, gateStateId, useGameBlock } from "./game-gate";

// p03 Partia czeka na przeciwnika `/games/{id}` (status waiting), widok twórcy (map p03.1–p03.10, game-invitations #21 UI).
// Polling every 3 s in the product (Q6); the prototype checks every second.

type Copy = "idle" | "ok" | "fail";

const FEEDBACK = {
  ok: "Skopiowano link do schowka.",
  fail: "Nie można skopiować automatycznie. Link jest zaznaczony — skopiuj go ręcznie (Ctrl+C).",
} as const;
const SHARE_FEEDBACK = "Udostępnianie dostępne tylko na telefonie.";

export function P03Waiting() {
  const sim = useSim();
  const route = useGameRoute("p03");
  const block = useGameBlock("p03", route);
  const current = useCurrentScreen();
  const game = accessibleGame(sim);
  const phase = game ? phaseOf(sim, game) : null;
  const [copy, setCopy] = useState<Copy>("idle");
  const [share, setShare] = useState(false);
  const [fails, setFails] = useState(0);
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const gameId = game?.id;
  useEffect(() => {
    setCopy("idle");
    setShare(false);
    setFails(0);
    setAsking(false);
    setCancelling(false);
    setCreateError(null);
  }, [gameId, sim.epoch, sim.role]);

  // p03.10: the polling fails while the "błąd odpytywania" control is on; three misses show the banner (L02).
  const polling = current === "p03" && phase === "waiting";
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => setFails((n) => (sim.scenario.pollError ? Math.min(n + 1, 3) : 0)), 1000);
    return () => clearInterval(timer);
  }, [polling, sim.scenario.pollError]);

  // p03.5: the creator sees "Przeciwnik dołączył" and moves on by button or after 2.5 s (A-04).
  const joinStep = phase === "ready" && route === "p03";
  useEffect(() => {
    if (!joinStep || current !== "p03") return;
    const timer = setTimeout(() => creatorOpens(gameId), 2500);
    return () => clearTimeout(timer);
  }, [joinStep, current, gameId]);

  let stateId = "p03.1";
  if (joinStep) stateId = "p03.5";
  else if (phase === "expired") stateId = "p03.9";
  else if (cancelling) stateId = "p03.7";
  else if (asking) stateId = "p03.6";
  else if (fails >= 3) stateId = "p03.10";
  else if (copy === "fail") stateId = "p03.3";
  else if (copy === "ok") stateId = "p03.2";
  else if (sim.scenario.shareUnavailable) stateId = "p03.4";
  if (sim.notice?.screen === "p03" && stateId === "p03.1") stateId = "p03.1 + p01.4";
  useStateId("p03", block !== "none" ? gateStateId(sim, block) : stateId);

  if (block !== "none") return <GameGate kind={block} />;
  if (!game || route !== "p03") return <SiteHeader />;

  const link = `https://gomoku.example/invite/${game.code}`;
  const notice = sim.notice?.screen === "p03" ? sim.notice : null;

  function selectLink() {
    const target = document.querySelector<HTMLElement>("#p03 dd");
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function onCopy() {
    setShare(false);
    if (sim.scenario.clipboardUnavailable) {
      // p03.3: no Clipboard API; the text is selected so the player can copy it by hand.
      selectLink();
      setCopy("fail");
    } else setCopy("ok");
  }

  async function onConfirmCancel() {
    if (cancelling) return;
    setCancelling(true);
    const result = await cancelInvitation(game!.id);
    setCancelling(false);
    setAsking(false);
    if (result.kind === "ok") {
      // L04: the creator leaves for the home page and the link is void.
      setNotice({ text: "Zaproszenie zostało anulowane. Link jest już nieważny.", screen: "p01" });
      go("p01");
    } else {
      setNotice({ text: "Przeciwnik zdążył dołączyć, zanim anulowałeś. Partii nie można już anulować jako zaproszenia.", screen: "p03" });
    }
  }

  async function onRecreate() {
    if (recreating) return;
    setRecreating(true);
    setCreateError(null);
    const result = await createGame();
    setRecreating(false);
    if (result.kind === "limit") setCreateError(`Zbyt wiele zaproszeń. Spróbuj ponownie za ${result.minutes} min.`);
    else if (result.kind === "server") setCreateError("Nie udało się utworzyć partii po stronie serwera. Spróbuj ponownie.");
    else if (result.kind === "network") setCreateError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    else if (result.kind === "active") setCreateError("Masz już partię. Najpierw dokończ bieżącą partię.");
  }

  if (joinStep) {
    return (
      <>
        <SiteHeader />
        <Main state={stateId}>
          <h1 className="m-0 text-section font-strong">Przeciwnik dołączył</h1>
          {sim.notice?.screen === "p03" && <Alert status="warning" title={sim.notice.text} />}
          <Alert status="success" title={`${opponentName(game)} dołączył do partii`}>
            Za chwilę przejdziesz do partii.
          </Alert>
          <div>
            <Button onClick={() => creatorOpens(game.id)}>Przejdź do partii</Button>
          </div>
        </Main>
      </>
    );
  }

  if (phase === "expired") {
    return (
      <>
        <SiteHeader />
        <Main narrow state={stateId}>
          <h1 className="m-0 text-section font-strong">Zaproszenie wygasło</h1>
          <Alert status="warning" title="Zaproszenie wygasło. Utwórz nowe." role="status">
            Zaproszenie jest ważne 24 godziny. Link i kod nie działają.
          </Alert>
          {createError && <Alert status="danger" title={createError} />}
          <div className="flex flex-wrap items-center gap-group">
            <Button loading={recreating} onClick={onRecreate}>{recreating ? "Tworzenie zaproszenia…" : "Utwórz zaproszenie"}</Button>
            <TextLink href="#p01" placement="standalone">Wróć do panelu głównego</TextLink>
          </div>
        </Main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <Main state={stateId}>
        <h1 className="m-0 text-section font-strong">Partia czeka na przeciwnika</h1>
        {notice && (
          <Alert status="info" title={notice.text} role="status">
            <Button variant="secondary" onClick={() => setNotice(null)}>Zamknij</Button>
          </Alert>
        )}
        <TurnStatus>
          {fails > 0 && fails < 3 ? `Czekamy na przeciwnika… Ponawiamy sprawdzanie (próba ${fails} z 3).` : "Czekamy na przeciwnika…"}
        </TurnStatus>
        {fails >= 3 && (
          <Alert status="danger" title="Nie udało się sprawdzić, czy przeciwnik dołączył. Ponawiamy próby.">
            <Button variant="secondary" onClick={() => setFails(0)}>Sprawdź teraz</Button>
          </Alert>
        )}
        {/* LUKA D03: the card has no copy states; the page owns the result line below it. */}
        <InviteCodeCard
          title="Zaproś znajomego"
          link={link}
          code={game.code}
          linkLabel="Link zaproszenia"
          codeLabel="Kod do wpisania na stronie „Masz kod?”"
          validUntil={`Ważne do ${formatValidUntil(game.expiresAt)}`}
          copyLabel="Kopiuj"
          copiedLabel="Skopiowano"
          copied={copy === "ok"}
          onCopy={onCopy}
          shareLabel={sim.scenario.shareUnavailable ? undefined : "Udostępnij"}
          onShare={sim.scenario.shareUnavailable ? undefined : () => { setCopy("idle"); setShare(true); }}
          cancelLabel="Anuluj zaproszenie"
          onCancel={() => setAsking(true)}
        />
        <p role="status" className="m-0 max-w-(--layout-width-dialog) text-meta text-text-secondary" data-testid="copy-status">
          {share ? SHARE_FEEDBACK : copy === "idle" ? "" : FEEDBACK[copy]}
        </p>
        <ConfirmDialog
          open={asking}
          onOpenChange={(open) => !open && !cancelling && setAsking(false)}
          title="Anulować zaproszenie?"
          description="Link i kod przestaną działać, a partia zostanie anulowana. Tej operacji nie można cofnąć."
          confirmLabel={cancelling ? "Anulowanie…" : "Tak, anuluj zaproszenie"}
          cancelLabel="Wróć"
          confirming={cancelling}
          onConfirm={onConfirmCancel}
        />
      </Main>
    </>
  );
}
