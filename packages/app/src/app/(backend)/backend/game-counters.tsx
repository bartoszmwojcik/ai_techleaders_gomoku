import type { FinishedGameStats } from "@gomoku/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomoku/ui/components/card";

import type { AccountTotals, GameCounters } from "@/server/services/admin/admin-overview-service";

import { END_REASON_LABELS, ORIGIN_LABELS, STATUS_LABELS, pairLabel } from "./labels";

function Stat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function CounterCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1">{children}</dl>
      </CardContent>
    </Card>
  );
}

/** Account totals and game counters (E08-S02); the per-pair counter is the persistent one from E06-S03. */
export function GameCountersSection({
  accounts,
  games,
  stats,
}: Readonly<{ accounts: AccountTotals; games: GameCounters; stats: FinishedGameStats }>) {
  return (
    <section aria-labelledby="counters-heading" className="space-y-4">
      <h2 id="counters-heading" className="text-xl font-semibold tracking-tight">
        Liczniki
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CounterCard title="Konta" description="Wszystkie założone konta">
          <Stat label="Wszystkie" value={accounts.total} />
          <Stat label="E-mail potwierdzony" value={accounts.verified} />
          <Stat label="E-mail niepotwierdzony" value={accounts.unverified} />
        </CounterCard>

        <CounterCard title="Partie w bazie teraz" description="Stan chwilowy: sprzątanie usuwa część zakończonych partii po ok. godzinie">
          {STATUS_LABELS.map(([key, label]) => (
            <Stat key={key} label={label} value={games.byStatus[key]} />
          ))}
        </CounterCard>

        <CounterCard title="Zakończone partie" description={`Licznik trwały, doba w strefie ${stats.timeZone}`}>
          <Stat label="Dziś" value={stats.today} />
          <Stat label="Ostatnie 7 dni" value={stats.last7Days} />
          <Stat label="Razem" value={stats.total} />
        </CounterCard>

        <CounterCard title="Zakończone wg pary typów" description="Licznik trwały (E06-S03); „agent” to dołączenie przez MCP">
          {stats.pairs.map((pair) => (
            <Stat key={pair.pair} label={pairLabel(pair)} value={pair.total} />
          ))}
        </CounterCard>

        <CounterCard title="Zakończone w bazie wg początku" description="Tylko partie, które jeszcze są w bazie">
          {ORIGIN_LABELS.map(([key, label]) => (
            <Stat key={key} label={label} value={games.finishedByOrigin[key]} />
          ))}
        </CounterCard>

        <CounterCard title="Zakończone w bazie wg zakończenia" description="Tylko partie, które jeszcze są w bazie">
          {END_REASON_LABELS.map(([key, label]) => (
            <Stat key={key} label={label} value={games.finishedByEndReason[key]} />
          ))}
        </CounterCard>
      </div>
    </section>
  );
}
