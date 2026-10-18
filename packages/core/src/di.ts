import { createContainer, InjectionMode, type AwilixContainer } from "awilix";

export {
  asClass,
  asFunction,
  asValue,
  Lifetime,
  type AwilixContainer,
  type Resolver,
} from "awilix";

/**
 * Creates an Awilix container with the project-wide conventions:
 * - PROXY injection mode: dependencies are destructured from the cradle
 *   (`constructor({ orm }: Deps)`), which survives minification and bundling;
 * - strict mode: lifetime leaks (a singleton depending on a scoped value) throw.
 */
export function createAppContainer<TCradle extends object>(): AwilixContainer<TCradle> {
  return createContainer<TCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });
}
