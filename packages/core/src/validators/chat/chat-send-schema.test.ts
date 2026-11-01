import { describe, expect, it } from "vitest";

import { chatSendSchema } from "./chat-send-schema";

const clientId = "3f1c1d1e-4a4b-4c4d-8e8f-0a0b0c0d0e0f";

describe("chatSendSchema", () => {
  it("accepts text and a client id", () => {
    expect(chatSendSchema.parse({ text: "hej", clientId })).toEqual({ text: "hej", clientId });
  });

  it("accepts the raw cap of 1000 units and refuses more", () => {
    expect(chatSendSchema.safeParse({ text: "a".repeat(1000), clientId }).success).toBe(true);
    expect(chatSendSchema.safeParse({ text: "a".repeat(1001), clientId }).success).toBe(false);
  });

  it.each([
    [{ clientId }],
    [{ text: 5, clientId }],
    [{ text: "hej" }],
    [{ text: "hej", clientId: "nope" }],
    [{ text: "hej", clientId, extra: 1 }],
  ])("refuses %j", (input) => {
    expect(chatSendSchema.safeParse(input).success).toBe(false);
  });

  it("does not echo the input in its messages", () => {
    const result = chatSendSchema.safeParse({ text: "tajne".repeat(300), clientId: "tajne" });
    expect(JSON.stringify(result.error?.issues)).not.toContain("tajne");
  });
});
