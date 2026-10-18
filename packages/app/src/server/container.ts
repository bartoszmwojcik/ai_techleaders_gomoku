import "server-only";

import { asClass, asValue, createAppContainer, type AwilixContainer } from "@gomoku/core";
import { createOrm, type EntityManager, type Orm } from "@gomoku/db";

import { HealthService } from "./services/health-service";

/** Application-wide (singleton) dependencies. */
export type AppCradle = {
  orm: Orm;
  healthService: HealthService;
};

/** Dependencies available within a single request. */
export type RequestCradle = AppCradle & {
  em: EntityManager;
};

// The ORM owns the connection pool, so it is cached on globalThis: it must survive
// HMR in development and be created once per server process. The promise (not the
// instance) is cached so concurrent first requests share it; it is dropped on failure
// so the next request can retry.
const globalForOrm = globalThis as typeof globalThis & { __gomokuOrm?: Promise<Orm> };

function getOrm(): Promise<Orm> {
  globalForOrm.__gomokuOrm ??= createOrm().catch((error: unknown) => {
    globalForOrm.__gomokuOrm = undefined;
    throw error;
  });
  return globalForOrm.__gomokuOrm;
}

// The container itself is cheap and module-scoped, so edited services are picked up on HMR.
let containerPromise: Promise<AwilixContainer<AppCradle>> | undefined;

async function buildContainer(): Promise<AwilixContainer<AppCradle>> {
  const container = createAppContainer<AppCradle>();
  container.register({
    orm: asValue(await getOrm()),
    healthService: asClass(HealthService).singleton(),
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
