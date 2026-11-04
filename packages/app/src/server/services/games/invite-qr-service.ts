import { NotFoundError, invitationUrl } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import type { Clock } from "../email/email-sender";
import { DEV_ORIGIN, GAME_NOT_FOUND_MESSAGE } from "./game-service";
import { qrSvg } from "./invite-qr";

type Deps = {
  em: EntityManager;
  clock: Clock;
  serverConfig: Pick<ServerConfig, "appOrigin">;
};

const READ_SQL = `
  select g.status, g.is_public, i.code, i.expires_at > ? as alive
  from invitations i join games g on g.id = i.game_id
  where i.game_id = ?`;

type Row = { status: string; is_public: boolean; code: string; alive: boolean };

/**
 * The QR code of a game's invitation link (D-35), for a viewer the route has already recognised as
 * its player or spectator. There is one only while the link leads somewhere:
 * - a waiting game with a live invitation (BR-52); only its creator can be a viewer then;
 * - a public game in progress, whose link opens watching (BR-53); closing the audience ends it (BR-43).
 * Otherwise `404`, so the code never outlives its page. It writes nothing: reading it is not a sign
 * of presence and does not slide a spectator's access. Request-scoped: it works through `em`.
 */
export class InviteQrService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #serverConfig: Deps["serverConfig"];

  constructor({ em, clock, serverConfig }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#serverConfig = serverConfig;
  }

  /** @throws AppError 404 */
  async svgFor(gameId: string): Promise<string> {
    const [row] = await this.#em.execute<Row[]>(READ_SQL, [this.#clock.now(), gameId]);
    const open = row && ((row.status === "waiting" && row.alive) || (row.status === "active" && row.is_public));
    if (!open) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
    return qrSvg(invitationUrl(this.#serverConfig.appOrigin ?? DEV_ORIGIN, row.code));
  }
}
