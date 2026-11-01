import { describe, expect, it } from "vitest";

import { chatSettingsSchema } from "./chat-settings-schema";

describe("chatSettingsSchema", () => {
  it.each([true, false])("accepts enabled %s", (enabled) => {
    expect(chatSettingsSchema.parse({ enabled })).toEqual({ enabled });
  });

  it.each([[{}], [{ enabled: "false" }], [{ enabled: 0 }], [{ enabled: null }], [{ enabled: true, extra: 1 }]])(
    "refuses %j",
    (input) => {
      expect(chatSettingsSchema.safeParse(input).success).toBe(false);
    },
  );

  it("does not echo the input in its messages", () => {
    const result = chatSettingsSchema.safeParse({ enabled: "tajne" });
    expect(JSON.stringify(result.error?.issues)).not.toContain("tajne");
  });
});
