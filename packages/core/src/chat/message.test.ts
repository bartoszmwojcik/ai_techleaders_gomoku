import { describe, expect, it } from "vitest";

import { CHAT_MAX_LENGTH, CHAT_RAW_MAX_UNITS, CHAT_RETENTION_MS } from "./constants";
import {
  CHAT_REJECTION_MESSAGES,
  chatMessageLength,
  normalizeChatMessage,
  type ChatTextResult,
} from "./message";
import { GUEST_TOKEN_GRACE_MS } from "../games/constants";

const limits = { maxLength: CHAT_MAX_LENGTH };
const ok = (text: string): ChatTextResult => ({ ok: true, text });
const refused = (reason: string) => ({ ok: false, reason });

describe("chat constants", () => {
  it("keeps the chat as long as a guest token", () => {
    expect(CHAT_RETENTION_MS).toBe(GUEST_TOKEN_GRACE_MS);
  });
});

describe("normalizeChatMessage - shape and length", () => {
  it.each([undefined, null, 5, {}, ["a"]])("refuses %j as not text", (raw) => {
    expect(normalizeChatMessage(raw, limits)).toEqual(refused("not_text"));
  });

  it.each(["", " ", "     "])("refuses %j as empty", (raw) => {
    expect(normalizeChatMessage(raw, limits)).toEqual(refused("empty"));
  });

  it("counts code points after NFKC, not UTF-16 units", () => {
    expect(normalizeChatMessage("a".repeat(200), limits)).toEqual(ok("a".repeat(200)));
    expect(normalizeChatMessage("a".repeat(201), limits)).toEqual(refused("too_long"));
    // 200 emoji are 400 UTF-16 units but 200 code points.
    expect(normalizeChatMessage("😀".repeat(200), limits)).toEqual(ok("😀".repeat(200)));
    expect(normalizeChatMessage("😀".repeat(201), limits)).toEqual(refused("too_long"));
  });

  it("uses the limit it is given", () => {
    expect(normalizeChatMessage("abc", { maxLength: 3 })).toEqual(ok("abc"));
    expect(normalizeChatMessage("abcd", { maxLength: 3 })).toEqual(refused("too_long"));
  });

  it("refuses raw input above the cap before normalizing it", () => {
    expect(normalizeChatMessage("a".repeat(CHAT_RAW_MAX_UNITS + 1), { maxLength: 5000 })).toEqual(refused("too_long"));
    // U+FDFA expands to 18 code points: counted after NFKC.
    expect(normalizeChatMessage("ﷺ".repeat(12), limits)).toEqual(refused("too_long"));
    expect(normalizeChatMessage("ﷺ", limits)).toMatchObject({ ok: true });
    expect(chatMessageLength("ﷺ")).toBe(18);
  });

  it("trims ASCII spaces and keeps inner ones", () => {
    expect(normalizeChatMessage("  dobra gra  ", limits)).toEqual(ok("dobra gra"));
    expect(normalizeChatMessage("a  b", limits)).toEqual(ok("a  b"));
  });

  it("stores the NFKC form", () => {
    expect(normalizeChatMessage("ﬁne ２ ™", limits)).toEqual(ok("fine 2 TM"));
    // A no-break space and an ideographic space become ASCII spaces and are trimmed.
    expect(normalizeChatMessage(" hej　", limits)).toEqual(ok("hej"));
    expect(chatMessageLength("ﬁ")).toBe(2);
    // The counter ignores the edge spaces the server trims.
    expect(chatMessageLength("  ab  ")).toBe(2);
  });
});

describe("normalizeChatMessage - characters", () => {
  it.each([
    ["a newline", "a\nb"],
    ["a tab", "a\tb"],
    ["a NUL", "a\u0000b"],
    ["a DEL", "a\u007Fb"],
    ["a line separator", "a b"],
    ["a paragraph separator", "a b"],
    ["a lone high surrogate", "a\uD800b"],
    ["a lone low surrogate", "a\uDC00b"],
  ])("refuses %s as a control character", (_name, raw) => {
    expect(normalizeChatMessage(raw, limits)).toEqual(refused("control_char"));
  });

  it.each([
    ["a zero-width space", "a​b"],
    ["a zero-width joiner between letters", "a‍b"],
    ["a leading zero-width joiner", "‍😀"],
    ["a trailing zero-width joiner", "😀‍"],
    ["a right-to-left override", "a‮b"],
    ["a bidi isolate", "a⁦b"],
    ["a BOM", "﻿a"],
    ["a soft hyphen", "a­b"],
    ["a private use character", "ab"],
    ["an unassigned code point", "a͸b"],
    ["a variation selector 1", "a︀b"],
    ["a supplementary variation selector", "a\u{E0100}b"],
    ["a tag character", "a\u{E0041}b"],
    ["a combining grapheme joiner", "a͏b"],
    ["a Hangul filler", "aᅟb"],
    ["a Hangul jungseong filler", "aᅠb"],
    ["a Hangul filler U+3164", "aㅤb"],
    ["a halfwidth Hangul filler", "aﾠb"],
    ["a braille blank", "a⠀b"],
    ["an Ogham space mark", "a b"],
  ])("refuses %s as invisible", (_name, raw) => {
    expect(normalizeChatMessage(raw, limits)).toEqual(refused("invisible_char"));
  });

  it("lets emoji, ZWJ sequences, RTL and ordinary text through", () => {
    for (const raw of ["👍", "❤️", "👨‍👩‍👧", "שלום עולם", "مرحبا", "Zażółć gęślą jaźń", "ok…", "1.5", "Dobra.Gramy", "<b>x</b>"]) {
      expect(normalizeChatMessage(raw, limits).ok).toBe(true);
    }
    expect(normalizeChatMessage("<script>alert(1)</script>", limits)).toEqual(ok("<script>alert(1)</script>"));
    expect(normalizeChatMessage("\"><svg/onload=alert(1)>", limits)).toEqual(ok("\"><svg/onload=alert(1)>"));
    expect(normalizeChatMessage("'; drop table chat_messages; --", limits).ok).toBe(true);
  });

  it("allows up to four combining marks in a row, not five", () => {
    const marks = (n: number) => `x${"́".repeat(n)}`;
    expect(normalizeChatMessage(marks(4), limits).ok).toBe(true);
    expect(normalizeChatMessage(marks(5), limits)).toEqual(refused("combining_run"));
    // A plain letter in between resets the run.
    expect(normalizeChatMessage(`${marks(4)}${marks(4)}`, limits).ok).toBe(true);
  });
});

describe("normalizeChatMessage - addresses", () => {
  it.each([
    "http://example.org",
    "https://example.org/x",
    "ftp://host",
    "mailto:a@b",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "www.example",
    "zobacz WWW.example",
    "EXAMPLE.COM",
    "10.0.0.1",
    "ip to 192.168.1.10 ok",
    "example.com",
    "Example.COM/path",
    "sub.domain.pl",
    "zobacz example。com",
    "example．com",
    "ｅｘａｍｐｌｅ．ｃｏｍ",
    "kto@gmail.com",
  ])("refuses %j as an address", (raw) => {
    expect(normalizeChatMessage(raw, limits)).toEqual(refused("url"));
  });

  it.each(["Dobra.Gramy", "1.5", "wersja 1.2.3", "ok... gramy", "tak.nie", "a.b", "3.14159", "co.", "e-mail", "Cześć.Co tam", "Jaka data: dziś", "Cześć.Top", "mailto: wyślę", "Example.Com"])(
    "lets %j through",
    (raw) => {
      expect(normalizeChatMessage(raw, limits).ok).toBe(true);
    },
  );
});

describe("CHAT_REJECTION_MESSAGES", () => {
  it("has a Polish sentence for every reason and never echoes input", () => {
    expect(Object.keys(CHAT_REJECTION_MESSAGES).sort()).toEqual(
      ["combining_run", "control_char", "empty", "invisible_char", "not_text", "too_long", "url"],
    );
    expect(CHAT_REJECTION_MESSAGES.url).toBe("Wiadomość nie może zawierać adresów internetowych.");
  });
});
