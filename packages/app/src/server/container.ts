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
import { PasswordHasher } from "./services/auth/password-hasher";
import {
  SessionService,
  type HasActiveGame,
} from "./services/auth/session-service";
import { GameParticipation } from "./services/auth/game-participation";
import {
  UserService,
  type InvalidateResetTokens,
} from "./services/auth/user-service";
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
  /** Games do not exist yet (G5); the games feature replaces this registration. */
  hasActiveGame: HasActiveGame;
  /** Reset tokens (#35) do not exist yet; the reset feature replaces this registration. */
  invalidateResetTokens: InvalidateResetTokens;
  /** Request-scoped (needs `em`): resolve only from a `withRequestScope` scope. */
  sessionService: SessionService;
  gameParticipation: GameParticipation;
  rateLimiter: RateLimiter;
  userService: UserService;
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
    hasActiveGame: asValue<HasActiveGame>(async () => false),
    invalidateResetTokens: asValue<InvalidateResetTokens>(
      async () => undefined,
    ),
    sessionService: asClass(SessionService).scoped(),
    gameParticipation: asClass(GameParticipation).singleton(),
    rateLimiter: asClass(RateLimiter).scoped(),
    userService: asClass(UserService).scoped(),
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
