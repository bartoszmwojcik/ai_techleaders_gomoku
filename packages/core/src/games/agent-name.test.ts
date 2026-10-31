import { describe, expect, it } from "vitest";

import { AGENT_NAME_MAX_LENGTH, normalizeAgentName } from "./agent-name";

const accepted = (input: unknown) => {
  const result = normalizeAgentName(input);
  return result.ok ? result.name : "REFUSED";
};

describe("normalizeAgentName", () => {
  it.each([undefined, null, "", "   "])("treats %j as no name", (input) => {
    expect(accepted(input)).toBeNull();
  });

  it.each([5, true, {}, [], ["gpt"]])("refuses %j (not a text)", (input) => {
    expect(accepted(input)).toBe("REFUSED");
  });

  it.each(["gpt-4.5", "claude opus 5.5", "qwen2.5-coder", "llama3.1:8b", "o3 (preview)", "GPT 5 + tools", "a/b_c"])(
    "accepts the model name %s",
    (name) => {
      expect(accepted(name)).toBe(name);
    },
  );

  it("trims, collapses spaces and applies NFKC", () => {
    expect(accepted("  claude   opus  5.5 ")).toBe("claude opus 5.5");
    expect(accepted("ＧＰＴ-4")).toBe("GPT-4");
    expect(accepted("ﬁne tuned")).toBe("fine tuned");
    expect(accepted("Ⅳ model")).toBe("IV model");
  });

  it("keeps the case and diacritics of the Latin script", () => {
    expect(accepted("Żółw 2")).toBe("Żółw 2");
  });

  it("counts code points: 40 pass, 41 do not", () => {
    expect(accepted("a".repeat(AGENT_NAME_MAX_LENGTH))).toBe("a".repeat(40));
    expect(accepted("a".repeat(AGENT_NAME_MAX_LENGTH + 1))).toBe("REFUSED");
    // The limit applies after the spaces are collapsed.
    expect(accepted(`${"a".repeat(20)}      ${"b".repeat(19)}`)).toBe(`${"a".repeat(20)} ${"b".repeat(19)}`);
  });

  it.each([
    ["a control character", "gpt\u0000"],
    ["a line feed", "gpt\n4"],
    ["a tab", "gpt\t4"],
    ["a zero-width space", "gpt​4"],
    ["a bidi override", "gpt‮4"],
    ["a no-break space", "gpt 4"],
    ["an ideographic space", "gpt　4"],
    ["a line separator", "gpt 4"],
    ["a private-use character", "gpt4"],
    ["a lone surrogate", "gpt\ud8004"],
    ["Cyrillic look-alikes", "аdmin"],
    ["Greek letters", "αβγ"],
    ["a combining mark (zalgo)", "g̈pt"],
    ["an emoji", "gpt 🤖"],
    ["markup", "<script>"],
    ["an attribute", '"><img onerror=1>'],
    ["a Markdown link", "[x](javascript:1)"],
    ["a template", "{{7*7}}"],
    ["a quote", "o'brien"],
    ["a scheme", "http://x"],
    ["a www address", "www.x"],
    ["a domain", "evil.com"],
    ["a domain with a short suffix", "model.ai"],
    ["only punctuation", "..."],
    ["only a plus", "+"],
  ])("refuses %s", (_label, input) => {
    expect(accepted(input)).toBe("REFUSED");
  });

  it("refuses a name made only of spaces and separators once collapsed to nothing visible", () => {
    expect(accepted(" . ")).toBe("REFUSED");
  });
});
