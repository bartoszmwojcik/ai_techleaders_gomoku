import { defineEntity, p } from "@mikro-orm/core";

/** Fixed-window attempt counter, keyed by a hashed identifier (no personal data). */
export const RateLimitBucket = defineEntity({
  name: "RateLimitBucket",
  tableName: "rate_limit_buckets",
  properties: {
    key: p.string().length(200).primary(),
    windowStart: p.datetime(),
    count: p.integer(),
  },
});
