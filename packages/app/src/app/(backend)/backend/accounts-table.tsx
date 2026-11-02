import { Badge } from "@gomoku/ui/components/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@gomoku/ui/components/table";

import {
  adminAccountsHref,
  SEARCH_MAX_LENGTH,
  type AdminAccountsQuery,
  type AdminAccountsSort,
} from "@/server/services/admin/admin-accounts-query";
import type { AdminAccountPage } from "@/server/services/admin/admin-overview-service";

import { formatDateTime } from "./labels";

function SortHeader({
  query,
  sort,
  children,
}: Readonly<{ query: AdminAccountsQuery; sort: AdminAccountsSort; children: React.ReactNode }>) {
  const active = query.sort === sort;
  const direction = active ? (query.direction === "asc" ? "desc" : "asc") : sort === "name" ? "asc" : "desc";
  return (
    <TableHead scope="col" aria-sort={active ? (query.direction === "asc" ? "ascending" : "descending") : undefined}>
      <a href={adminAccountsHref(query, { sort, direction, page: 1 })} className="underline-offset-4 hover:underline">
        {children}
      </a>
    </TableHead>
  );
}

/**
 * The accounts of the panel (E08-S02): read only. The search is a GET form by player name (not by
 * e-mail: it would travel in the URL); sorting and paging are plain links, no client code.
 */
export function AccountsSection({
  accounts,
  query,
}: Readonly<{ accounts: AdminAccountPage; query: AdminAccountsQuery }>) {
  return (
    <section aria-labelledby="accounts-heading" className="space-y-4">
      <h2 id="accounts-heading" className="text-xl font-semibold tracking-tight">
        Konta
      </h2>

      <form action="/backend" method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm" htmlFor="account-search">
          <span className="block">Szukaj po nazwie gracza</span>
          <input
            id="account-search"
            name="q"
            type="search"
            defaultValue={query.search}
            maxLength={SEARCH_MAX_LENGTH}
            autoComplete="off"
            className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        {query.sort !== "created" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Szukaj
        </button>
      </form>

      {accounts.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak kont pasujących do wyszukiwania.</p>
      ) : (
        // Keyboard-focusable scroll area: only the table scrolls on a narrow screen, not the page.
        <div tabIndex={0} role="region" aria-label="Lista kont" className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption className="sr-only">Konta graczy</TableCaption>
            <TableHeader>
              <TableRow>
                <SortHeader query={query} sort="name">
                  Nazwa
                </SortHeader>
                <TableHead scope="col">E-mail</TableHead>
                <TableHead scope="col">E-mail potwierdzony</TableHead>
                <SortHeader query={query} sort="created">
                  Założone
                </SortHeader>
                <TableHead scope="col" className="text-right">
                  Partie
                </TableHead>
                <TableHead scope="col">Rola</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.rows.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{account.displayName}</TableCell>
                  <TableCell>{account.email}</TableCell>
                  <TableCell>{account.emailVerified ? "Tak" : "Nie"}</TableCell>
                  <TableCell>
                    <time dateTime={account.createdAt.toISOString()}>{formatDateTime(account.createdAt)}</time>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{account.finishedGames}</TableCell>
                  <TableCell>
                    {account.role === "admin" ? <Badge>Administrator</Badge> : <Badge variant="secondary">Gracz</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Strony listy kont" className="flex items-center gap-4 text-sm">
        <span>
          {`Strona ${accounts.page} z ${accounts.pageCount} (${accounts.total} kont)`}
        </span>
        {accounts.page > 1 ? <a href={adminAccountsHref(query, { page: accounts.page - 1 })}>Poprzednia</a> : null}
        {accounts.page < accounts.pageCount ? (
          <a href={adminAccountsHref(query, { page: accounts.page + 1 })}>Następna</a>
        ) : null}
      </nav>
    </section>
  );
}
