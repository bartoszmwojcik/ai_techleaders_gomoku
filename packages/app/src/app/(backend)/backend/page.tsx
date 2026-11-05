import { connection } from "next/server";

import { BOARD_SIZE, WIN_LENGTH } from "@gomoku/core";
import { Badge } from "@gomoku/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomoku/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gomoku/ui/components/table";

import { withRequestScope } from "@/server/container";
import { requireAdmin } from "@/server/http/admin-gate";
import { describeError } from "@/server/http/describe-error";
import { parseAdminAccountsQuery } from "@/server/services/admin/admin-accounts-query";

import { AccountsSection } from "./accounts-table";
import { GameCountersSection } from "./game-counters";

export const metadata = { title: "Przegląd" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The admin panel (E08-S02, read only): counters and the list of accounts. `requireAdmin()` comes
 * first - before any read - and answers 404 to everybody but the installation administrator.
 */
export default async function BackendHomePage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  await requireAdmin();
  await connection();
  const query = parseAdminAccountsQuery(await searchParams);

  const overview = await withRequestScope(async ({ cradle }) => {
    const health = await cradle.healthService.check();
    // The reason is only the class and code of the error (`HealthService`: never the message with hosts or a query); it goes to the server log only, never to the browser.
    if (!health.database.ok) console.error("Backend panel: database check failed", health.database.reason);
    try {
      const [games, accounts, stats, page] = await Promise.all([
        cradle.adminOverviewService.gameCounters(),
        cradle.adminOverviewService.accountTotals(),
        cradle.finishedGameStatsService.finishedByPair(),
        cradle.adminOverviewService.accountPage(query),
      ]);
      return { health, data: { games, accounts, stats, page } };
    } catch (error) {
      // Only the class and code of the error: its text may carry a query with e-mail addresses.
      console.error("Backend panel: reading the data failed", describeError(error));
      return { health, data: null };
    }
  });
  const { health, data } = overview;

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Panel administracyjny</h1>

      {data ? (
        <>
          <GameCountersSection accounts={data.accounts} games={data.games} stats={data.stats} />
          <AccountsSection accounts={data.page} query={query} />
        </>
      ) : (
        <Card role="alert">
          <CardHeader>
            <CardTitle>Nie udało się wczytać danych</CardTitle>
            <CardDescription>Sprawdź logi serwera.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Baza danych</CardTitle>
            <CardDescription>PostgreSQL przez MikroORM</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.database.ok ? (
              <Badge>Połączono</Badge>
            ) : (
              <>
                <Badge variant="destructive">Brak połączenia</Badge>
                <p className="text-sm text-muted-foreground">Sprawdź logi serwera.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zasady gry</CardTitle>
            <CardDescription>Konfiguracja z @gomoku/core</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parametr</TableHead>
                  <TableHead className="text-right">Wartość</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Rozmiar planszy</TableCell>
                  <TableCell className="text-right">
                    {BOARD_SIZE}×{BOARD_SIZE}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Kamieni w linii do wygranej</TableCell>
                  <TableCell className="text-right">{WIN_LENGTH}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
