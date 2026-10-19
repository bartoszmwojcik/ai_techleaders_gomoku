import { describe, expect, it } from "vitest";

import { asClass, asFunction, asValue, createAppContainer, Lifetime } from "./di";

describe("createAppContainer", () => {
  it("injects dependencies by destructuring the cradle (PROXY mode)", () => {
    class Greeter {
      readonly #name: string;

      constructor({ name }: { name: string }) {
        this.#name = name;
      }

      greet() {
        return `Hello, ${this.#name}`;
      }
    }

    const container = createAppContainer<{ name: string; greeter: Greeter }>();
    container.register({
      name: asValue("Gomoku"),
      greeter: asClass(Greeter).singleton(),
    });

    expect(container.cradle.greeter.greet()).toBe("Hello, Gomoku");
  });

  it("rejects a singleton that depends on a scoped registration (strict mode)", () => {
    const container = createAppContainer<{ requestId: string; cache: string }>();
    container.register({
      requestId: asFunction(() => "request-1").scoped(),
      cache: asFunction(({ requestId }: { requestId: string }) => requestId).singleton(),
    });

    expect(() => container.createScope().cradle.cache).toThrow(/lifetime/i);
  });

  it("re-exports the Awilix lifetimes", () => {
    expect(Lifetime).toMatchObject({ SINGLETON: "SINGLETON", SCOPED: "SCOPED", TRANSIENT: "TRANSIENT" });
  });
});
