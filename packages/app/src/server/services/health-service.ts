import type { Orm } from "@gomoku/db";

import { describeError } from "../http/describe-error";

export type HealthReport = {
  status: "ok" | "error";
  /** `reason` is the class and driver code of the error only (e.g. `Error ECONNREFUSED`): the message carries hosts, ports or queries. */
  database: { ok: true } | { ok: false; reason: string };
};

type Deps = { orm: Orm };

export class HealthService {
  readonly #orm: Orm;

  constructor({ orm }: Deps) {
    this.#orm = orm;
  }

  async check(): Promise<HealthReport> {
    // A real query rather than `orm.checkConnection()`: MikroORM v7 connects lazily on the
    // first query, and `checkConnection()` reports "not established" until then.
    try {
      await this.#orm.em.getConnection().execute("select 1");
      return { status: "ok", database: { ok: true } };
    } catch (error) {
      const { name, code } = describeError(error);
      const reason = code === undefined ? name : `${name} ${code}`;
      return { status: "error", database: { ok: false, reason } };
    }
  }
}
