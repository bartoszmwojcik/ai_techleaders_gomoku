import { MikroORM } from "@mikro-orm/postgresql";

import { createOrmConfig, type OrmConfig } from "./config";

export type Orm = MikroORM;
export type { EntityManager } from "@mikro-orm/postgresql";

/**
 * Creates an ORM instance with its own connection pool. Connections are opened
 * lazily, so use `orm.checkConnection()` to verify the database is reachable.
 */
export function createOrm(overrides: Partial<OrmConfig> = {}): Promise<Orm> {
  return MikroORM.init(createOrmConfig(overrides));
}
