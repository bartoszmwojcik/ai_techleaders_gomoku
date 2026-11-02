// Logic of `npm run admin:create` (E08-S01, BR-35; entry point: admin-create-cli.ts). Creates the
// installation administrator's account (`ADMIN_EMAIL`) or takes an existing one over: new password,
// confirmed e-mail, every session and unused token revoked. The password is read only from the
// terminal (hidden) or from one line of stdin; never from an argument or a variable (they leak
// through `ps`, /proc and `docker inspect`). Prints one JSON line without secrets; errors go to
// stderr; exit code 0 / 1 / 130 (Ctrl+C).
import { AppError, displayNameSchema, newPasswordSchema } from "@gomoku/core";
import { createOrm as defaultCreateOrm, type Orm } from "@gomoku/db";

import { describeError } from "../server/http/describe-error";
import { parsePasswordHashCost, readAdminEmail } from "../server/config";
import { AdminAccountService } from "../server/services/auth/admin-account-service";
import { createInvalidateResetTokens } from "../server/services/auth/invalidate-reset-tokens";
import { PasswordHasher } from "../server/services/auth/password-hasher";
import { SessionService } from "../server/services/auth/session-service";
import { systemClock } from "../server/services/email/email-sender";
import { InterruptedError, type Prompter } from "./terminal-input";

export type AdminCreateArgs = { name?: string; yes: boolean };

export type AdminCreateDeps = {
  env: Record<string, string | undefined>;
  argv: readonly string[];
  prompter: Prompter;
  stdout: { write: (text: string) => unknown };
  stderr: { write: (text: string) => unknown };
  createOrm?: (overrides: Parameters<typeof defaultCreateOrm>[0]) => Promise<Orm>;
};

const PASSWORD_ATTEMPTS = 3;

/** `--name <n>` / `--name=<n>` and `--yes`; anything else is an error (a typo must not be ignored). */
export function parseAdminCreateArgs(argv: readonly string[]): AdminCreateArgs | { error: string } {
  const args: AdminCreateArgs = { yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--yes") args.yes = true;
    else if (arg === "--name") {
      const value = argv[index + 1];
      if (value === undefined) return { error: "Flaga --name wymaga wartości." };
      args.name = value;
      index += 1;
    } else if (arg.startsWith("--name=")) args.name = arg.slice("--name=".length);
    else return { error: `Nieznany argument: ${arg}.` };
  }
  return args;
}

/** `host:port/database` of the target, without credentials (an operation on a dev database is deliberate, lesson 2026-10-28). */
export function describeDatabaseTarget(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "nieustawiona (DATABASE_URL)";
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return "nieczytelna (DATABASE_URL)";
  }
}

class OperatorError extends Error {}

async function readPassword(prompter: Prompter): Promise<string> {
  const attempts = prompter.interactive ? PASSWORD_ATTEMPTS : 1;
  let lastProblem = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const password = await prompter.ask("Hasło administratora: ", { secret: true });
    if (password === undefined) throw new OperatorError("Brak hasła na wejściu.");
    const checked = newPasswordSchema.safeParse(password);
    if (!checked.success) {
      lastProblem = checked.error.issues[0]!.message;
    } else if (!prompter.interactive) {
      return password;
    } else if ((await prompter.ask("Powtórz hasło: ", { secret: true })) === password) {
      return password;
    } else {
      lastProblem = "Hasła się różnią.";
    }
    if (attempt < attempts - 1) await prompter.ask(`${lastProblem} Wciśnij Enter, aby spróbować ponownie.`);
  }
  throw new OperatorError(lastProblem);
}

function parseName(raw: string): string {
  const checked = displayNameSchema.safeParse(raw);
  if (!checked.success) throw new OperatorError(checked.error.issues[0]!.message);
  return checked.data;
}

export async function runAdminCreate({
  env,
  argv,
  prompter,
  stdout,
  stderr,
  createOrm = defaultCreateOrm,
}: AdminCreateDeps): Promise<number> {
  let orm: Orm | undefined;
  try {
    let adminEmail: string | undefined;
    try {
      adminEmail = readAdminEmail(env, false);
    } catch (error) {
      throw new OperatorError((error as Error).message);
    }
    if (!adminEmail) throw new OperatorError("Ustaw ADMIN_EMAIL (adres administratora instalacji).");
    const parsed = parseAdminCreateArgs(argv);
    if ("error" in parsed) throw new OperatorError(parsed.error);
    const requestedName = parsed.name === undefined ? undefined : parseName(parsed.name);

    stderr.write(`Baza danych: ${describeDatabaseTarget(env.DATABASE_URL)}\n`);
    const password = await readPassword(prompter);
    let passwordCost: number;
    try {
      passwordCost = parsePasswordHashCost(env.PASSWORD_HASH_COST);
    } catch (error) {
      throw new OperatorError((error as Error).message);
    }
    // Hashed before the transaction: bcrypt must not hold a connection.
    const passwordHash = await new PasswordHasher({ passwordHashCost: passwordCost }).hash(password);

    // ensureDatabase: false - a maintenance command must never create a missing database.
    orm = await createOrm({ ensureDatabase: false, pool: { min: 0, max: 1 } });
    const em = orm.em.fork();
    const service = new AdminAccountService({
      em,
      sessionService: new SessionService({ em, hasActiveGame: async () => false }),
      invalidateResetTokens: createInvalidateResetTokens({ clock: systemClock }),
      clock: systemClock,
    });

    const existing = await service.find(adminEmail);
    let displayName = requestedName;
    if (existing) {
      if (requestedName && requestedName !== existing.displayName) {
        stderr.write(`Uwaga: konto zostaje przy nazwie „${existing.displayName}”, --name zignorowano.\n`);
      }
      if (!parsed.yes) {
        if (!prompter.interactive) {
          throw new OperatorError("Konto już istnieje; bez terminala potwierdź przejęcie flagą --yes.");
        }
        const answer = await prompter.ask(
          `Konto „${existing.displayName}” (założone ${existing.createdAt}) już istnieje. Przejąć je (nowe hasło, wylogowanie wszystkich sesji)? [t/N] `,
        );
        if (!/^(t|tak|y|yes)$/i.test(answer?.trim() ?? "")) throw new OperatorError("Anulowano, nic nie zmieniono.");
      }
    } else if (displayName === undefined) {
      if (!prompter.interactive) throw new OperatorError("Podaj nazwę gracza flagą --name.");
      const answer = await prompter.ask("Nazwa gracza: ");
      if (answer === undefined) throw new OperatorError("Brak nazwy gracza na wejściu.");
      displayName = parseName(answer);
    }

    const result = await service.provision({ email: adminEmail, displayName, passwordHash });
    stdout.write(`${JSON.stringify({ ok: true, action: result.action, userId: result.userId, revokedSessions: result.revokedSessions })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof InterruptedError) {
      stderr.write("Przerwano.\n");
      return 130;
    }
    // An unknown error may carry the connection string or row values: only its class and code are shown.
    const message =
      error instanceof OperatorError || error instanceof AppError
        ? error.message
        : (({ name, code }) => `Nieoczekiwany błąd (${code ? `${name} ${code}` : name}).`)(describeError(error));
    stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
    return 1;
  } finally {
    await orm?.close();
  }
}
