import { connection } from "next/server";

import { BOARD_SIZE, WIN_LENGTH } from "@gomoku/core";
import { Badge } from "@gomoku/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomoku/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gomoku/ui/components/table";

import { withRequestScope } from "@/server/container";

export const metadata = { title: "Przegląd" };

export default async function BackendHomePage() {
  await connection();
  const health = await withRequestScope(({ cradle }) => cradle.healthService.check());

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Panel administracyjny</h1>

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
                <p className="text-sm text-muted-foreground">{health.database.reason}</p>
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
