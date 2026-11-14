import { globSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import * as core from "@gomoku/core";
import type { FieldIssue } from "@gomoku/core/http/api-result";
import { toFieldIssues, toValidationError } from "@gomoku/core/http/zod-error";
import type { Dict } from "@gomoku/core/i18n/translator";
import { describe, expect, it } from "vitest";
import type { ZodError, ZodType } from "zod";

import { apiErrorText, fieldIssueKeys, fieldIssueText } from "@/lib/api-error-text";
import { toolErrorOf } from "@/server/mcp/mcp-errors";

import enErrors from "./catalogs/en/errors";
import frErrors from "./catalogs/fr/errors";
import plErrors from "./catalogs/pl/errors";
import {
  CLIENT_PARSE_SITES,
  FIELD_CODES_TRANSLATED_ELSEWHERE,
  MULTI_MESSAGE_CODES,
  NOT_FOR_USER_CODES,
  ROUTE_PARSE_SITES,
  SCHEMA_SOURCES,
  SERVICE_FIELD_ERRORS,
  type InventoryRule,
} from "./error-inventory";

// Spec 2026-11-13-e15-completion, Phase 5 steps 1, 3 and 5: the inventory is checked against the sources (anything
// found and not listed, or listed and not found, fails with its file), and every entry has a code and a text.

const APP = resolve(import.meta.dirname, "..");
const CORE = resolve(APP, "../../core/src");
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const read = (file: string) => readFileSync(file, "utf8");
const filesOf = (root: string, patterns: string[]) =>
  patterns.flatMap((pattern) => globSync(pattern, { cwd: root })).filter((file) => !isTest(file)).sort();

const DICTS = { pl: plErrors, en: enErrors, fr: frErrors } as const satisfies Record<string, Dict>;
const TEXTS = Object.entries(DICTS).map(([locale, dict]) => ({ locale: locale as keyof typeof DICTS, dict }));

const schemaOf = (name: string) => (core as unknown as Record<string, ZodType>)[name]!;

/** Every issue of the inventory's samples, by field, as the client receives it. */
function issuesOf(name: string, samples: readonly unknown[]): { field: string; issue: FieldIssue }[] {
  return samples.flatMap((sample) => {
    const parsed = schemaOf(name).safeParse(sample);
    if (parsed.success) throw new Error(`${name}: sample ${JSON.stringify(sample)} is valid`);
    return Object.entries(toFieldIssues(parsed.error)).flatMap(([field, issues]) => issues.map((issue) => ({ field, issue })));
  });
}

function ruleOf(field: string, { code, params = {} }: FieldIssue): InventoryRule {
  const variant =
    params.exact === true ? "exact"
    : params.inclusive === true ? "inclusive"
    : params.inclusive === false ? "exclusive"
    : typeof params.format === "string" ? params.format
    : undefined;
  return { field, code, ...(typeof params.origin === "string" && { origin: params.origin }), ...(variant && { variant }) };
}

const ruleId = (rule: InventoryRule) => [rule.field, rule.code, rule.origin ?? "", rule.variant ?? ""].join("|");

/** The text of `call` between the parenthesis opening at `start` and the one closing it. */
function callAt(source: string, start: number): string {
  let depth = 1;
  let index = start;
  while (depth > 0 && index < source.length) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    index += 1;
  }
  return source.slice(start, index - 1);
}

/** The first argument of a call (a string, a template or an expression) and the rest after its comma. */
function firstArgument(text: string): [string, string] {
  const trimmed = text.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "`") {
    let index = 1;
    while (trimmed[index] !== quote) index += trimmed[index] === "\\" ? 2 : 1;
    return [trimmed.slice(0, index + 1), trimmed.slice(index + 1).replace(/^\s*,/, "")];
  }
  const comma = trimmed.indexOf(",");
  return comma < 0 ? [trimmed, ""] : [trimmed.slice(0, comma).trim(), trimmed.slice(comma + 1)];
}

/** Options without their nested groups, so `code` of a `fieldIssues` entry is not taken for the error's code. */
function topLevel(options: string): string {
  let text = options.trim().replace(/^\{/, "").replace(/\}$/, "");
  for (let before = ""; before !== text; ) {
    before = text;
    text = text.replace(/\{[^{}]*\}|\[[^[\]]*\]/g, "");
  }
  return text;
}

const DEFAULT_CODES: Readonly<Record<string, string>> = {
  ValidationError: "VALIDATION",
  UnauthorizedError: "UNAUTHORIZED",
  ForbiddenError: "FORBIDDEN",
  NotFoundError: "NOT_FOUND",
  ConflictError: "CONFLICT",
  GoneError: "GONE",
  TooManyRequestsError: "RATE_LIMITED",
  ServiceUnavailableError: "SERVICE_UNAVAILABLE",
};

type Throw = { file: string; line: number; code: string; message: string; text: string | undefined; reason: string | undefined; call: string };

const THROW_FILES = [
  ...filesOf(CORE, ["**/*.ts"]).map((file) => resolve(CORE, file)),
  ...filesOf(APP, ["server/**/*.ts"]).map((file) => resolve(APP, file)),
];

/** String constants by file: `const NAME = "…"` (a template keeps its source, which is what identifies it). */
const CONSTANTS = new Map(
  THROW_FILES.map((file) => [
    file,
    new Map([...read(file).matchAll(/const (\w+) =\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g)].map((m) => [m[1]!, m[2]!])),
  ]),
);

function literal(value: string): string {
  return value.startsWith('"') ? (JSON.parse(value) as string) : value;
}

/** The text a message expression stands for: a literal, a constant of the file, or one it imports by a relative path. */
function textOf(file: string, expression: string): string | undefined {
  if (/^["`]/.test(expression)) return literal(expression);
  if (!/^\w+$/.test(expression)) return undefined;
  const own = CONSTANTS.get(file)!.get(expression);
  if (own !== undefined) return literal(own);
  const imported = new RegExp(`import \\{[^}]*\\b${expression}\\b[^}]*\\} from "(\\.[^"]+)"`).exec(read(file));
  if (imported) {
    const target = resolve(dirname(file), `${imported[1]}.ts`);
    const value = CONSTANTS.get(target)?.get(expression);
    if (value !== undefined) return literal(value);
  }
  const everywhere = new Set([...CONSTANTS.values()].map((constants) => constants.get(expression)).filter((value) => value !== undefined));
  return everywhere.size === 1 ? literal([...everywhere][0]!) : undefined;
}

const THROWS: Throw[] = THROW_FILES.flatMap((file) => {
  const source = read(file);
  return [...source.matchAll(/new (AppError|\w+Error)\(/g)].flatMap((match): Throw[] => {
    const kind = match[1]!;
    if (kind !== "AppError" && !(kind in DEFAULT_CODES)) return [];
    const call = callAt(source, match.index + match[0].length);
    let code: string | undefined;
    let message: string;
    if (kind === "AppError") {
      const [, afterStatus] = firstArgument(call);
      const [codeArgument, afterCode] = firstArgument(afterStatus);
      code = /^"([A-Z_0-9]+)"$/.exec(codeArgument)?.[1];
      [message] = firstArgument(afterCode);
    } else {
      let options: string;
      [message, options] = firstArgument(call);
      code = /\bcode: "([A-Z_0-9]+)"/.exec(topLevel(options))?.[1] ?? DEFAULT_CODES[kind];
    }
    if (code === undefined) return []; // `new AppError(status, code, …)` passing codes through (the class itself).
    const data = /\bdata: \{([^{}]*)\}/.exec(call)?.[1] ?? "";
    const reason = /\breason: "(\w+)"/.exec(data)?.[1];
    const line = source.slice(0, match.index).split("\n").length;
    return [{ file: relative(resolve(APP, "../../.."), file), line, code, message, text: textOf(file, message), reason, call }];
  });
});

const where = (each: { file: string; line: number }) => `${each.file}:${each.line}`;

describe("the inventory matches the sources", () => {
  it("lists every schema reached from the player's path, and only those", () => {
    const files = [
      ...filesOf(APP, ["app/api/**/*.ts"]).filter((file) => !file.startsWith("app/api/mcp/")),
      ...filesOf(APP, ["app/(frontend)/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"]),
    ];
    const found = new Set(files.flatMap((file) => [...read(resolve(APP, file)).matchAll(/\b([a-z]\w*Schema)\b/g)].map((m) => m[1]!)));

    expect([...found].sort()).toEqual(SCHEMA_SOURCES.map(({ schema }) => schema).sort());
    for (const { schema } of SCHEMA_SOURCES) expect(schemaOf(schema), `${schema} is exported by @gomoku/core`).toBeDefined();
  });

  it("gives every custom rule of core a code (never a bare `custom`)", () => {
    const files = filesOf(CORE, ["validators/**/*.ts", "games/nickname.ts", "games/history.ts"]);
    const bare = files.flatMap((file) => {
      const source = read(resolve(CORE, file));
      return [...source.matchAll(/\.refine\(|addIssue\(/g)]
        .filter((match) => !/\bcode: "[A-Z_0-9]+"/.test(callAt(source, match.index + match[0].length)))
        .map((match) => `${file}:${source.slice(0, match.index).split("\n").length}`);
    });

    expect(bare).toEqual([]);
  });

  it("lists every local check of a form, and the checks of an address apart", () => {
    const found = filesOf(APP, ["app/(frontend)/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"]).flatMap((file) =>
      [...read(resolve(APP, file)).matchAll(/\b(\w+Schema)\.(?:safeParse|parse)\(/g)].map((m) => `${file} ${m[1]}`),
    );
    const listed = [...CLIENT_PARSE_SITES, ...ROUTE_PARSE_SITES].map(({ file, schema }) => `${file} ${schema}`);

    expect(found.sort()).toEqual(listed.sort());
    for (const site of CLIENT_PARSE_SITES) expect(SCHEMA_SOURCES.map(({ schema }) => schema)).toContain(site.schema);
  });

  it("lists every field error a service throws, each with its code in `fieldIssues`", () => {
    const found = filesOf(APP, ["server/services/**/*.ts"]).flatMap((file) => {
      const source = read(resolve(APP, file));
      const all = [...source.matchAll(/fieldErrors: \{/g)].length;
      const coded = [...source.matchAll(/fieldErrors: \{ (\w+): \[[^\]]*\] \},\s*fieldIssues: \{ (\w+): \[\{ code: "([A-Z_0-9]+)"/g)];
      expect(coded.length, `${file}: every fieldErrors has fieldIssues of the same field`).toBe(all);
      return coded.map((m) => {
        expect(m[2], file).toBe(m[1]);
        return `${file} ${m[1]} ${m[3]}`;
      });
    });

    expect(found.sort()).toEqual(SERVICE_FIELD_ERRORS.map(({ file, field, code }) => `${file} ${field} ${code}`).sort());
  });

  it("finds every throw's message, and lists the codes other than VALIDATION that carry more than one", () => {
    const unresolved = THROWS.filter((each) => each.code !== "VALIDATION" && each.text === undefined).map(where);
    expect(unresolved, "a message must be a literal or a constant (one `new` per message)").toEqual([]);

    const texts = new Map<string, Set<string>>();
    for (const each of THROWS) {
      if (each.code === "VALIDATION") continue;
      if (!texts.has(each.code)) texts.set(each.code, new Set());
      texts.get(each.code)!.add(each.text!);
    }
    const multi = [...texts].filter(([, set]) => set.size > 1).map(([code]) => code).sort();

    expect(multi).toEqual(Object.keys(MULTI_MESSAGE_CODES).sort());
  });

  it("gives each message of such a code its own `data.reason`, the message unchanged", () => {
    for (const each of THROWS.filter((throwSite) => throwSite.code in MULTI_MESSAGE_CODES)) {
      const reasons = MULTI_MESSAGE_CODES[each.code]!;
      expect(each.reason, `${where(each)}: data.reason`).toBeDefined();
      expect(reasons[each.reason!], `${where(each)}: ${each.code}.${each.reason}`).toBe(each.text);
    }
    for (const [code, reasons] of Object.entries(MULTI_MESSAGE_CODES)) {
      for (const reason of Object.keys(reasons)) {
        expect(THROWS.some((each) => each.code === code && each.reason === reason), `${code}.${reason} is thrown`).toBe(true);
      }
    }
  });

  it("never gives VALIDATION a new `data.reason` (only the chat's refusals, which MCP already knows)", () => {
    const chat = THROWS.filter((each) => each.code === "VALIDATION" && /\breason\b/.test(each.call)).map(
      (each) => `${each.file} ${/\breason: ([^,}]+)/.exec(each.call)![1]!.trim()}`,
    );

    expect(chat.sort()).toEqual([
      "packages/app/src/server/services/chat/chat-service.ts checked.reason",
      "packages/app/src/server/services/chat/chat-service.ts checked.reason",
      'packages/app/src/server/services/games/agent-game-service.ts "secret"',
    ]);
  });

  it("names a reason for every code kept from the player", () => {
    const thrown = new Set(THROWS.map((each) => each.code));
    for (const [code, reason] of Object.entries(NOT_FOR_USER_CODES)) {
      expect(thrown.has(code), code).toBe(true);
      expect(reason.trim()).not.toBe("");
    }
  });
});

describe("every error has a code and a text in Polish, English and French", () => {
  describe.each(SCHEMA_SOURCES)("$schema", ({ schema, samples, rules, exempt = {}, as }) => {
    const issues = issuesOf(schema, samples).filter(({ field }) => !(field in exempt));

    it("yields exactly the listed rules", () => {
      const produced = new Set(issues.map(({ field, issue }) => ruleId(ruleOf(field, issue))));
      expect([...produced].sort()).toEqual(rules.map(ruleId).sort());
    });

    it("never yields a bare custom or unknown code on a field the player fills in", () => {
      expect(issues.filter(({ issue }) => issue.code === "custom" || issue.code === "unknown")).toEqual([]);
    });

    it("keeps Polish exactly as the schema words it (Polish screens do not change)", () => {
      for (const sample of samples) {
        const { fieldErrors = {}, fieldIssues = {} } = toValidationError((schemaOf(schema).safeParse(sample) as { error: ZodError }).error)!;
        for (const [field, fieldIssueList] of Object.entries(fieldIssues)) {
          if (field in exempt) continue;
          fieldIssueList.forEach((issue, index) => {
            const message = fieldErrors[field]![index]!;
            // Zod's own English default (a check the schema gives no words) had no Polish to keep: it gets one now.
            if (message.startsWith("Invalid input")) return;
            expect(fieldIssueText({}, as ?? field, issue), `${schema} ${field} ${issue.code}`).toBe(message);
          });
        }
      }
    });

    it.each(TEXTS)("has a text for every issue in $locale", (texts) => {
      for (const { field, issue } of issues) {
        expect(fieldIssueText(texts, as ?? field, issue), `${schema} ${field} ${issue.code}`).toEqual(expect.any(String));
      }
    });
  });

  it("exempts no field of a form", () => {
    for (const site of CLIENT_PARSE_SITES) {
      const exempt = SCHEMA_SOURCES.find(({ schema }) => schema === site.schema)!.exempt ?? {};
      for (const field of site.fields) expect(field in exempt, `${site.file} ${field}`).toBe(false);
    }
    for (const { exempt = {} } of SCHEMA_SOURCES) for (const reason of Object.values(exempt)) expect(reason.trim()).not.toBe("");
  });

  it.each(TEXTS)("has a text for every field error of a service in $locale", (texts) => {
    for (const { field, code } of SERVICE_FIELD_ERRORS) {
      if (code in FIELD_CODES_TRANSLATED_ELSEWHERE) continue;
      // The field's own key, not a generic Zod text: a service's code is never a Zod code.
      expect(fieldIssueText(texts, field, { code }), `${field} ${code}`).toEqual(expect.any(String));
      expect(fieldIssueKeys(field, { code })[0]).toBe(`field.${field}.${code}`);
    }
  });

  it.each(TEXTS)("has a text for every code a player can meet in $locale", (texts) => {
    const codes = new Set(THROWS.map((each) => each.code).filter((code) => !(code in NOT_FOR_USER_CODES)));
    for (const code of codes) {
      const text = apiErrorText(texts, { code, message: "\u0000fallback" });
      expect(text, code).not.toBe("\u0000fallback");
    }
    for (const [code, reasons] of Object.entries(MULTI_MESSAGE_CODES)) {
      if (code in NOT_FOR_USER_CODES) continue;
      for (const reason of Object.keys(reasons)) {
        const keyed = (texts.dict.api as Record<string, unknown>)[code] as Record<string, unknown>;
        expect(typeof keyed[reason], `${code}.${reason}`).toBe("string");
      }
    }
  });
});

describe("MCP stays as it was", () => {
  it("answers every VALIDATION of the inventory with INVALID_INPUT, the same message and no new reason", () => {
    for (const { schema, samples } of SCHEMA_SOURCES) {
      for (const sample of samples) {
        const error = toValidationError((schemaOf(schema).safeParse(sample) as { error: ZodError }).error)!;
        const result = toolErrorOf(error);

        expect(result.structuredContent).toEqual({ error: { code: "INVALID_INPUT", message: error.message, retryable: false } });
        expect(JSON.stringify(result)).not.toContain("fieldIssues");
      }
    }
  });

  it("passes no `data` of the codes with a new reason (only RATE_LIMITED's wait)", () => {
    for (const [code, reasons] of Object.entries(MULTI_MESSAGE_CODES)) {
      for (const reason of Object.keys(reasons)) {
        const error = new core.AppError(409, code, "Polski tekst", undefined, { reason });
        expect(JSON.stringify(toolErrorOf(error)), `${code}.${reason}`).not.toContain(`"${reason}"`);
      }
    }
  });
});
