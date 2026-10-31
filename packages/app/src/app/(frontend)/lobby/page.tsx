import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUserWith } from "@/server/http/auth";

import { LobbyPanel } from "./lobby-panel";

export const metadata: Metadata = {
  title: "Lobby — Gomoku",
  robots: { index: false, follow: false },
};

export default async function LobbyPage() {
  // Reads the session cookie and the database, so the page is rendered per request.
  await connection();
  // One request scope reads the session and the lobby together.
  const session = await getCurrentUserWith((user, { lobbyService }) => lobbyService.view(user.id));
  // A visitor without an account has no lobby (BR-22); signing in brings them back here.
  if (!session) redirect("/login?next=%2Flobby");
  const { me, currentGame, seekers } = session.data;
  return (
    <LobbyPanel
      initial={{ me: me && { id: me.id, expiresInMs: me.expiresInMs }, currentGame, seekers }}
    />
  );
}
