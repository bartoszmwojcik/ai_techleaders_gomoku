// Lobby: the "looking for a game" status (#25, BR-12). Constants and the view the API returns.

/** How long a status lasts, from the moment it was set; never renewed (BR-12, D-09). */
export const SEEKING_TTL_MS = 5 * 60 * 1000;

/** Marking oneself as seeking is limited per user, to stop a mark/withdraw loop (#25 Q9). */
export const LOBBY_MARK_LIMIT = 30;
export const LOBBY_MARK_WINDOW_MS = 60 * 60 * 1000;

/** The list of other seekers shows the oldest statuses first, up to this many (#25). */
export const LOBBY_LIST_LIMIT = 50;

/** The user's own status. Times are computed by the server (the client counts down locally). */
export type LobbyMeView = {
  id: string;
  createdAt: Date;
  /** Time left before the status expires. */
  expiresInMs: number;
};

/** Another seeker, as the list shows them: no e-mail and no account id (BR-14). */
export type LobbySeekerView = {
  /** Id of the `lobby_seekers` row, the handle a pick (#26) will use. */
  id: string;
  displayName: string;
  /** How long they have been looking. */
  sinceMs: number;
  expiresInMs: number;
};

export type LobbyView = {
  me: LobbyMeView | null;
  /** The game that holds the user's slot (BR-13), so the client can send them back to it. */
  currentGame: { gameId: string; status: "waiting" | "active" } | null;
  seekers: LobbySeekerView[];
};
