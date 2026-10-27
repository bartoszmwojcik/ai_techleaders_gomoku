import { Session } from "./auth/session";
import { User } from "./auth/user";
import { RateLimitBucket } from "./rate-limit/rate-limit-bucket";

// Registry of all MikroORM entities. Entities are defined with `defineEntity`
// (no decorators) and must be listed here explicitly: folder discovery does not
// work inside the bundled Next.js server.
export const entities = [User, Session, RateLimitBucket] as const;
