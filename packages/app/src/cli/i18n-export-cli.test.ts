import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { writeFileSync } = vi.hoisted(() => ({ writeFileSync: vi.fn() }));
vi.mock("node:fs", async (original) => ({ ...(await original<object>()), writeFileSync }));

const argv = process.argv;
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  writeFileSync.mockReset();
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.argv = argv;
  stdout.mockRestore();
  stderr.mockRestore();
});

async function run(...args: string[]) {
  process.argv = [...argv.slice(0, 2), ...args];
  await import("./i18n-export-cli");
}

it("prints every namespace of the real catalogs as CSV, French and German drafts and all", async () => {
  await run();
  const csv = stdout.mock.calls[0]![0] as string;
  const lines = csv.slice(1).split("\r\n");
  expect(lines[0]).toBe("key,PL,EN,FR,DE,status,params");
  expect(lines.some((line) => line.startsWith("common."))).toBe(true);
  expect(lines.some((line) => line.startsWith("header."))).toBe(true);
  // The French typography travels with the text (a non-breaking space before the colon).
  expect(lines).toContain("show.room.title,Pokaz: {layout},Show: {layout},Démonstration : {layout},Vorführung: {layout},en: draft; fr: draft; de: draft,layout");
  expect(writeFileSync).not.toHaveBeenCalled();
});

it("writes the namespaces asked for to a file", async () => {
  await run("--ns", "show,header", "--out", "/tmp/review.csv");
  const [path, csv] = writeFileSync.mock.calls[0]!;
  expect(path).toBe("/tmp/review.csv");
  const keys = (csv as string).split("\r\n").slice(1, -1).map((line) => line.split(",")[0]!);
  expect(keys.every((key) => key.startsWith("show.") || key.startsWith("header."))).toBe(true);
  expect(keys[0]!.startsWith("show.")).toBe(true);
  expect(stderr.mock.calls[0]![0]).toMatch(/^\d+ texts written to \/tmp\/review\.csv$/);
  expect(stdout).not.toHaveBeenCalled();
});
