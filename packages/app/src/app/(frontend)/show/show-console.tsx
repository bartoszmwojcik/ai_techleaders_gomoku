"use client";

import type { BotLevel } from "@gomoku/core";
import type { Locale } from "@gomoku/core/i18n/locales";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { Field } from "@gomoku/ui/game/field";
import { Panel } from "@gomoku/ui/game/panel";
import { Select } from "@gomoku/ui/game/select";
import { StatusBadge } from "@gomoku/ui/game/status-badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { apiCall } from "@/lib/api-client";
import { errorText, showTranslator, type ShowDict, type ShowTranslator } from "@/lib/show/texts";
import type { CreatedShow, ShowCheck, ShowOverview, ShowPreflight, ShowSummary } from "@/server/services/games/show-service";

import { EndShowButton } from "./end-show-button";

type Props = {
  initial: ShowOverview;
  /** From the server (`clientI18n`): nothing in Polish. */
  locale?: Locale;
  dict?: ShowDict;
};

type Failure = { title: string; text: string; code: string };

/**
 * `/show`, the administrator's console (show-mode, "UI/UX"): switched off (state 1), a show in progress with "back"
 * and "end" (state 2), or the form of a new bot vs bot show with "will it start" (state 3). Errors are alerts with
 * their code, the focus goes to the heading.
 */
export function ShowConsole({ initial, locale, dict }: Props) {
  const t = useMemo(() => showTranslator(locale, dict), [locale, dict]);
  const router = useRouter();
  const [current, setCurrent] = useState<ShowSummary | null>(initial.current);
  const [levels, setLevels] = useState<[BotLevel, BotLevel]>([1, 1]);
  const [checks, setChecks] = useState<ShowPreflight | "failed" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  if (!initial.enabled) {
    return (
      <Shell>
        <h1 className="m-0 text-section font-strong">{t("console.title")}</h1>
        <EmptyState title={t("console.disabledTitle")}>{t("console.disabledBody")}</EmptyState>
      </Shell>
    );
  }

  const blocked = current !== null || !initial.botVsBotEnabled;
  const body = { layout: "bot-bot", levels };

  async function check() {
    setChecking(true);
    const result = await apiCall<ShowPreflight>("/api/show/preflight", { body });
    setChecking(false);
    setChecks(result.ok ? result.data : "failed");
  }

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStarting(true);
    setFailure(null);
    const result = await apiCall<CreatedShow>("/api/show", { body });
    if (result.ok) {
      router.push(`/show/${result.data.gameId}`);
      return;
    }
    inFlight.current = false;
    setStarting(false);
    const running = result.error.code === "SHOW_RUNNING" && typeof result.error.data?.gameId === "string";
    if (running) setCurrent({ gameId: result.error.data!.gameId as string, status: "active", layout: "bot-bot" });
    setFailure({ title: t("errors.createTitle"), text: errorText(t, result.error), code: result.error.code });
    heading.current?.focus();
  }

  const levelOptions = (initial.level2Enabled ? [1, 2] : [1]).map((level) => ({
    value: String(level),
    label: t("console.level", { level }),
  }));

  return (
    <Shell>
      <h1 ref={heading} tabIndex={-1} className="m-0 text-section font-strong outline-none">
        {t("console.title")}
      </h1>
      <p className="m-0 text-body text-text-secondary">{t("console.lead")}</p>
      {failure && (
        <div data-testid="show-error">
          <Alert status="danger" role="alert" title={failure.title}>
            <p className="m-0">{failure.text}</p>
            <p className="m-0 text-meta">{t("errors.code", { code: failure.code })}</p>
          </Alert>
        </div>
      )}
      {current && (
        <Panel title={t("console.runningTitle")} data-testid="show-running">
          <p className="m-0">{t("console.runningLayout", { layout: t(`layout.${current.layout}`) })}</p>
          <p className="m-0">{t(`console.runningStatus.${current.status}`)}</p>
          <div className="flex flex-wrap items-center gap-stack">
            <Button asChild variant="secondary">
              <Link href={`/show/${current.gameId}`}>{t("console.back")}</Link>
            </Button>
            <EndShowButton gameId={current.gameId} t={t} onEnded={() => setCurrent(null)} />
          </div>
        </Panel>
      )}
      <Panel title={t("console.formTitle")}>
        <p className="m-0">{t("console.runningLayout", { layout: t("layout.bot-bot") })}</p>
        {!initial.botVsBotEnabled && <Alert status="warning" title={t("console.botVsBotDisabled")} />}
        {([0, 1] as const).map((index) => (
          <Field
            key={index}
            label={t("console.levelLabel", { seat: index + 1 })}
            hint={initial.level2Enabled ? undefined : t("console.level2Blocked")}
          >
            {(control) => (
              <Select
                {...control}
                data-testid={`show-level-${index + 1}`}
                options={levelOptions}
                value={String(levels[index])}
                disabled={blocked}
                onChange={(event) => {
                  const next: [BotLevel, BotLevel] = [...levels];
                  next[index] = Number(event.target.value) as BotLevel;
                  setLevels(next);
                }}
              />
            )}
          </Field>
        ))}
        <Button variant="secondary" loading={checking} onClick={() => void check()} data-testid="show-check" className="self-start">
          {t("console.check")}
        </Button>
        {checks && <ChecksResult t={t} checks={checks} />}
        <hr className="m-0 w-full border-border-default" />
        <Button size="large" loading={starting} disabled={blocked} onClick={() => void start()} data-testid="show-start">
          {t("console.start")}
        </Button>
        {current && <p className="m-0 text-meta text-text-secondary">{t("console.formBlocked")}</p>}
      </Panel>
    </Shell>
  );
}

function ChecksResult({ t, checks }: { t: ShowTranslator; checks: ShowPreflight | "failed" }) {
  if (checks === "failed") return <Alert status="danger" role="alert" title={t("checks.failed")} />;
  return (
    <div className="flex flex-col gap-group" data-testid="show-checks">
      <Alert status={checks.ok ? "success" : "warning"} title={checks.ok ? t("checks.ready") : t("checks.notReady")} />
      <ul aria-label={t("checks.title")} className="m-0 flex list-none flex-col gap-group p-0">
        {checks.checks.map((check) => (
          <li key={check.id} className="flex flex-wrap items-center justify-between gap-group">
            <span>{checkLabel(t, check)}</span>
            <StatusBadge status={check.ok === null ? "info" : check.ok ? "success" : "danger"}>
              {check.ok === null ? t("checks.unknown") : check.ok ? t("checks.pass") : t("checks.fail")}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function checkLabel(t: ShowTranslator, check: ShowCheck): string {
  const detail = check.detail ?? {};
  if (check.id === "memory") {
    return t("checks.item.memory", { available: t.megabytes(detail.availableMb ?? 0), min: t.megabytes(detail.minAvailableMb ?? 0) });
  }
  if (check.id === "slot") return t("checks.item.slot", { active: detail.activeGames ?? 0, max: detail.maxActiveGames ?? 0 });
  return t(`checks.item.${check.id}`);
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-(--layout-width-dialog) flex-1 flex-col gap-stack px-panel py-section">{children}</main>;
}
