import { describe, expect, it } from "vitest";

import { entities } from "./index";
import { EmailVerificationToken } from "./auth/email-verification-token";
import { PasswordResetToken } from "./auth/password-reset-token";
import { Session } from "./auth/session";
import { Game } from "./games/game";
import { GamePlayer } from "./games/game-player";
import { Invitation } from "./games/invitation";

describe("entities registry", () => {
  it("lists the account entities with their tables", () => {
    const tables = entities.map((entity) => entity.meta.tableName);
    expect(tables).toEqual([
      "users",
      "sessions",
      "email_verification_tokens",
      "password_reset_tokens",
      "rate_limit_buckets",
      "games",
      "game_players",
      "invitations",
    ]);
  });

  it("declares the unique keys for e-mail, display-name key and token hash", () => {
    const [user, session, verification, reset] = entities;
    expect(user.meta.properties.email.unique).toBe(true);
    expect(user.meta.properties.displayNameKey.unique).toBe(true);
    expect(user.meta.properties.emailVerifiedAt.nullable).toBe(true);
    expect(session.meta.properties.tokenHash.unique).toBe(true);
    expect(verification.meta.properties.tokenHash.unique).toBe(true);
    expect(reset.meta.properties.tokenHash.unique).toBe(true);
  });

  it("keeps the verification token usage marker nullable", () => {
    const { usedAt, expiresAt } = entities[2].meta.properties;
    expect(usedAt.nullable).toBe(true);
    expect(expiresAt.nullable).toBeFalsy();
  });

  it("keeps the reset token usage marker nullable and expiry required", () => {
    const { usedAt, expiresAt } = entities[3].meta.properties;
    expect(usedAt.nullable).toBe(true);
    expect(expiresAt.nullable).toBeFalsy();
  });
});

describe("game entities", () => {
  it("keeps the turn start and the lifecycle timestamps nullable", () => {
    const { turnStartedAt, startedAt, finishedAt } = Game.meta.properties;
    expect(turnStartedAt.nullable).toBe(true);
    expect(startedAt.nullable).toBe(true);
    expect(finishedAt.nullable).toBe(true);
  });

  it("declares the rematch columns as optional", () => {
    const { rematchOfferedBySeat, rematchExpiresAt, rematchState, rematchGame } =
      Game.meta.properties;
    for (const property of [rematchOfferedBySeat, rematchExpiresAt, rematchState, rematchGame]) {
      expect(property.nullable).toBe(true);
    }
  });

  it("declares the participant uniques, including the partial BR-13 index", () => {
    const names = GamePlayer.meta.uniques.map((unique) => unique.name);
    expect(names).toEqual([
      "game_players_game_id_seat_unique",
      "game_players_game_id_user_id_unique",
      "game_players_user_id_active_unique",
    ]);
    expect(GamePlayer.meta.uniques[2]?.where).toBe("is_active");
    const { guestTokenHash, nickname, seenAt, user } = GamePlayer.meta.properties;
    expect(nickname.nullable).toBe(true);
    expect(nickname.length).toBe(24);
    expect(guestTokenHash.unique).toBe(true);
    expect(guestTokenHash.nullable).toBe(true);
    expect(seenAt.nullable).toBe(true);
    expect(user.nullable).toBe(true);
  });

  it("keeps the invitation code unique and the consumption markers optional", () => {
    const { code, consumedAt, consumedBy, game } = Invitation.meta.properties;
    expect(code.unique).toBe(true);
    expect(consumedAt.nullable).toBe(true);
    expect(consumedBy.nullable).toBe(true);
    expect(game.unique).toBe(true);
  });
});

describe("entity discovery", () => {
  it("is accepted by MikroORM and maps the session to its user", async () => {
    const { createOrm } = await import("../orm");
    const orm = await createOrm();
    try {
      const gameMeta = orm.getMetadata().get(Game.class);
      expect(gameMeta.properties.clockMs1?.fieldNames).toEqual(["clock_ms_1"]);
      expect(gameMeta.properties.clockMs2?.fieldNames).toEqual(["clock_ms_2"]);
      expect(gameMeta.properties.rematchGame?.deleteRule).toBe("set null");
      const playerMeta = orm.getMetadata().get(GamePlayer.class);
      expect(playerMeta.properties.game?.deleteRule).toBe("cascade");
      expect(playerMeta.properties.user?.deleteRule).toBe("set null");
      expect(playerMeta.properties.guestTokenHash?.columnTypes[0]).toBe("char(64)");
      const sessionMeta = orm.getMetadata().get(Session.class);
      expect(sessionMeta.properties.user?.deleteRule).toBe("cascade");
      expect(sessionMeta.properties.tokenHash?.columnTypes[0]).toBe("char(64)");
      const tokenMeta = orm.getMetadata().get(EmailVerificationToken.class);
      expect(tokenMeta.properties.user?.deleteRule).toBe("cascade");
      expect(tokenMeta.properties.tokenHash?.columnTypes[0]).toBe("char(64)");
      const resetMeta = orm.getMetadata().get(PasswordResetToken.class);
      expect(resetMeta.properties.user?.deleteRule).toBe("cascade");
      expect(resetMeta.properties.tokenHash?.columnTypes[0]).toBe("char(64)");
    } finally {
      await orm.close();
    }
  });
});
