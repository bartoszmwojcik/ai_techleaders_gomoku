import "server-only";

import {
  asClass,
  asFunction,
  asValue,
  createAppContainer,
  type AwilixContainer,
} from "@gomoku/core";
import { createOrm, entities, type EntityManager, type Orm } from "@gomoku/db";

import { readServerConfig, type ServerConfig } from "./config";
import { AccountService } from "./services/auth/account-service";
import { PasswordHasher } from "./services/auth/password-hasher";
import {
  SessionService,
  type HasActiveGame,
} from "./services/auth/session-service";
import { EmailVerificationService } from "./services/auth/email-verification-service";
import { GameParticipation } from "./services/auth/game-participation";
import { AgentGameService } from "./services/games/agent-game-service";
import { AgentSeatService } from "./services/games/agent-seat-service";
import { ColorDraw } from "./services/games/color-draw";
import { GameMoveService } from "./services/games/game-move-service";
import { RematchService } from "./services/games/rematch-service";
import { FinishedGameStatsService } from "./services/games/finished-game-stats-service";
import { GameHistoryService } from "./services/games/game-history-service";
import { GameService } from "./services/games/game-service";
import { InvitationCodes } from "./services/games/invitation-codes";
import { InvitationService } from "./services/games/invitation-service";
import { LobbyService } from "./services/games/lobby-service";
import {
  SqlTimeoutSettler,
  type TimeoutSettler,
} from "./services/games/timeout-settler";
import { createInvalidateResetTokens } from "./services/auth/invalidate-reset-tokens";
import { PasswordResetService } from "./services/auth/password-reset-service";
import {
  UserService,
  type InvalidateResetTokens,
} from "./services/auth/user-service";
import {
  systemClock,
  type Clock,
  type EmailSender,
} from "./services/email/email-sender";
import { createEmailSender } from "./services/email/create-email-sender";
import { HealthService } from "./services/health-service";
import { RateLimiter } from "./services/rate-limit/rate-limiter";

/** Application-wide (singleton) dependencies. */
export type AppCradle = {
  orm: Orm;
  healthService: HealthService;
  passwordHashCost: number;
  passwordHasher: PasswordHasher;
  /** Resolved lazily: invalid production settings fail the routes that use it, not `/api/health`. */
  serverConfig: ServerConfig;
  /** G5: does the user have a game that was running when the session expired. Request-scoped. */
  hasActiveGame: HasActiveGame;
  /** Marks a user's unused reset tokens as used; writes only through the `em` it is given. */
  invalidateResetTokens: InvalidateResetTokens;
  clock: Clock;
  /** Chosen by EMAIL_TRANSPORT (`file` | `brevo`); resolved lazily, so a bad setting fails only the routes that send mail. */
  emailSender: EmailSender;
  /** Request-scoped (needs `em`): resolve only from a `withRequestScope` scope. */
  sessionService: SessionService;
  gameParticipation: GameParticipation;
  gameService: GameService;
  gameMoveService: GameMoveService;
  rematchService: RematchService;
  invitationCodes: InvitationCodes;
  /** Draws who plays black when the opponent joins (#22 Q1). */
  colorDraw: ColorDraw;
  invitationService: InvitationService;
  /** An agent takes the second seat over MCP (E06-S01). */
  agentSeatService: AgentSeatService;
  /** The tools get_state and play_move of an agent (E06-S02). */
  agentGameService: AgentGameService;
  /** The finished games of an account (E04-S01). */
  gameHistoryService: GameHistoryService;
  /** Finished games per pair of participant kinds (E06-S03); the admin panel reads the same. */
  finishedGameStatsService: FinishedGameStatsService;
  /** The "looking for a game" status and the lobby list (#25). */
  lobbyService: LobbyService;
  /** No-op until the clock (#23) delivers the real settlement of timed-out games. */
  timeoutSettler: TimeoutSettler;
  rateLimiter: RateLimiter;
  emailVerificationService: EmailVerificationService;
  userService: UserService;
  accountService: AccountService;
  passwordResetService: PasswordResetService;
};

/** Dependencies available within a single request. */
export type RequestCradle = AppCradle & {
  em: EntityManager;
};

// The ORM owns the connection pool, so it is cached on globalThis: it must survive
// HMR in development and be created once per server process. The promise (not the
// instance) is cached so concurrent first requests share it; it is dropped on failure
// so the next request can retry.
//
// The cache is keyed by the entity registry object, not global: a production build compiles
// pages (RSC layer) and route handlers separately, so the app modules, and with them the
// entity definitions, exist once per layer. An ORM registered the entities of one layer cannot
// serve services of the other (`em.create(User)` fails), so each copy of the entities gets
// its own ORM (and pool: mind DATABASE_POOL_MAX), while HMR, which keeps the entities
// module, still reuses it.
const globalForOrm = globalThis as typeof globalThis & {
  __gomokuOrms?: WeakMap<object, Promise<Orm>>;
};

function getOrm(): Promise<Orm> {
  const orms = (globalForOrm.__gomokuOrms ??= new WeakMap());
  let orm = orms.get(entities);
  if (!orm) {
    orm = createOrm().catch((error: unknown) => {
      orms.delete(entities);
      throw error;
    });
    orms.set(entities, orm);
  }
  return orm;
}

// The container itself is cheap and module-scoped, so edited services are picked up on HMR.
let containerPromise: Promise<AwilixContainer<AppCradle>> | undefined;

async function buildContainer(): Promise<AwilixContainer<AppCradle>> {
  const container = createAppContainer<AppCradle>();
  container.register({
    orm: asValue(await getOrm()),
    healthService: asClass(HealthService).singleton(),
    // From PASSWORD_HASH_COST (default 12); lazy like the rest of the config.
    passwordHashCost: asFunction(
      ({ serverConfig }: AppCradle) => serverConfig.passwordHashCost,
    ).singleton(),
    passwordHasher: asClass(PasswordHasher).singleton(),
    serverConfig: asFunction(() => readServerConfig(process.env)).singleton(),
    hasActiveGame: asFunction(
      ({ gameParticipation }: AppCradle): HasActiveGame =>
        (userId, expiredAt) =>
          gameParticipation.hasActiveGame(userId, { startedBefore: expiredAt }),
    ).scoped(),
    invalidateResetTokens: asFunction(
      ({ clock }: AppCradle): InvalidateResetTokens =>
        createInvalidateResetTokens({ clock }),
    ).singleton(),
    clock: asValue(systemClock),
    emailSender: asFunction(({ serverConfig, clock }: AppCradle): EmailSender =>
      createEmailSender({ serverConfig, clock, fetch: globalThis.fetch }),
    ).singleton(),
    sessionService: asClass(SessionService).scoped(),
    gameParticipation: asClass(GameParticipation).scoped(),
    gameService: asClass(GameService).scoped(),
    gameMoveService: asClass(GameMoveService).scoped(),
    rematchService: asClass(RematchService).scoped(),
    invitationCodes: asClass(InvitationCodes).singleton(),
    colorDraw: asClass(ColorDraw).singleton(),
    invitationService: asClass(InvitationService).scoped(),
    agentSeatService: asClass(AgentSeatService).scoped(),
    agentGameService: asClass(AgentGameService).scoped(),
    gameHistoryService: asClass(GameHistoryService).scoped(),
    finishedGameStatsService: asClass(FinishedGameStatsService).scoped(),
    lobbyService: asClass(LobbyService).scoped(),
    timeoutSettler: asClass(SqlTimeoutSettler).scoped(),
    rateLimiter: asClass(RateLimiter).scoped(),
    emailVerificationService: asClass(EmailVerificationService).scoped(),
    userService: asClass(UserService).scoped(),
    accountService: asClass(AccountService).scoped(),
    passwordResetService: asClass(PasswordResetService).scoped(),
  });
  return container;
}

export function getContainer(): Promise<AwilixContainer<AppCradle>> {
  containerPromise ??= buildContainer().catch((error: unknown) => {
    containerPromise = undefined;
    throw error;
  });
  return containerPromise;
}

/**
 * Runs `fn` with a request-scoped container that has its own forked EntityManager.
 * Use it in route handlers, server actions and server components.
 */
export async function withRequestScope<T>(
  fn: (scope: AwilixContainer<RequestCradle>) => Promise<T>,
): Promise<T> {
  const container = await getContainer();
  const scope = container.createScope<Pick<RequestCradle, "em">>();
  scope.register({ em: asValue(container.cradle.orm.em.fork()) });
  return fn(scope);
}
