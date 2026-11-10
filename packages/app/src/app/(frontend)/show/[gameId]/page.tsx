import { gameIdSchema } from "@gomoku/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
import { projectorParam } from "@/lib/show/texts";
import { requireAdmin } from "@/server/http/admin-gate";
import { loadShowView } from "@/server/http/show-view";

import { ShowRoom } from "./show-room";

// No title of its own: the 404 every other visitor gets must not name the show.
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ projektor?: string | string[] }>;
};

/**
 * `/show/[gameId]`, the read-only view of a show (show-mode B3): `requireAdmin()` first; anybody else, a bad id and a
 * game that is not a show get the same 404. `?projektor=1|0` is the source of truth of the projector view (P20).
 * No `loading.tsx` (it would hide the 404 status).
 */
export default async function ShowPage({ params, searchParams }: Props) {
  await connection();
  await requireAdmin();
  const { gameId } = await params;
  if (!gameIdSchema.safeParse(gameId).success) notFound();
  const show = await loadShowView(gameId);
  if (!show) notFound();
  const projector = projectorParam((await searchParams).projektor);
  const texts = clientI18n(await getI18n("show"));
  const header = clientI18n(await getI18n("header"));
  return <ShowRoom gameId={gameId} initial={show} projector={projector} {...texts} headerDict={header.dict} />;
}
