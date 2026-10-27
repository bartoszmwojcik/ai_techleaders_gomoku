import { describe, expect, it } from "vitest";

import type { ApiResult } from "./api-result";
import { ConflictError } from "./errors";

describe("ApiResult", () => {
  it("is narrowed by the ok discriminant and matches AppError.toBody()", () => {
    const failure: ApiResult<never> = {
      ok: false,
      error: new ConflictError("taken").toBody(),
    };
    const success: ApiResult<{ id: string }> = { ok: true, data: { id: "1" } };

    expect(failure.ok ? null : failure.error.code).toBe("CONFLICT");
    expect(success.ok ? success.data.id : null).toBe("1");
  });
});
