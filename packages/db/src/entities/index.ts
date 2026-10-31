import { EmailVerificationToken } from "./auth/email-verification-token";
import { PasswordResetToken } from "./auth/password-reset-token";
import { Session } from "./auth/session";
import { User } from "./auth/user";
import { Game } from "./games/game";
import { GamePairCounter } from "./games/game-pair-counter";
import { GamePlayer } from "./games/game-player";
import { Invitation } from "./games/invitation";
import { LobbySeeker } from "./games/lobby-seeker";
import { RateLimitBucket } from "./rate-limit/rate-limit-bucket";

// Registry of all MikroORM entities. Entities are defined with `defineEntity`
// (no decorators) and must be listed here explicitly: folder discovery does not
// work inside the bundled Next.js server.
export const entities = [
  User,
  Session,
  EmailVerificationToken,
  PasswordResetToken,
  RateLimitBucket,
  Game,
  GamePlayer,
  Invitation,
  LobbySeeker,
  GamePairCounter,
] as const;
