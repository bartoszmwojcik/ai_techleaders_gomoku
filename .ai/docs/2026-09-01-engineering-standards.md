# Gomoku — Engineering Standards & Package Structure

Date: 2026-09-01
Updated: 2026-10-18 (adapted from a generic marketplace template to Gomoku)
Status: active

Grounded in the current monorepo (`.ai/specs/implemented/2026-10-18-monorepo-architecture.md`)
and the product scope (`.ai/specs/product-brief.md`: accounts, invitations, open lobby,
real-time 1:1 freestyle gomoku on a 15×15 board with a 10-minute chess clock, game history).

`AGENTS.md` is the binding source for the stack, package boundaries and workflow. This
document adds the detail on top of it: naming, where code goes, shared layers, domain
rules and the review checklist. If the two ever disagree, `AGENTS.md` wins — fix this
document.

---

## 0. Open Decisions (do not standardize until decided)

These are deliberately left open. Do not implement around them with an ad-hoc choice —
raise them with the project owner and record the outcome in a spec under `.ai/specs/`.
Resolved decisions stay in the table with their outcome.

| ID | Decision | Why it matters |
|---|---|---|
| OD-1 | Real-time transport for games and lobby: WebSocket, SSE or polling. | Brief lists it as the next blocking uncertainty. Determines whether an in-process event emitter is enough (single instance) or a cross-instance fan-out (e.g. Postgres `LISTEN/NOTIFY`) is needed. |
| OD-2 | Authentication mechanism: own credentials + session cookie/JWT, or an auth library. | **Resolved 2026-10-24** (`.ai/specs/2026-10-24-account-registration.md`, Q1/Q2): own credentials, password hashed with `bcryptjs` (cost 12), session stored in PostgreSQL (`sessions`; random 32-byte token in an `httpOnly` cookie, only its SHA-256 in the database), CSRF through a mandatory `Origin` equal to `APP_ORIGIN` plus the `X-Gomoku-Request` header. No auth library. |
| OD-3 | New dependencies: `zod` (shared validation), `pino` (logging), env validation. | **Partly resolved 2026-10-24** (Q3): `zod` is approved and used for the shared schemas in `@gomoku/core`; `bcryptjs` is approved with OD-2. `pino` (logging) and env validation stay open: until approved, "logger" means the shared logging helper. |

---

## 1. Final List of Engineering Rules

### Naming

| Element | Convention | Example |
|---|---|---|
| Package | `packages/<name>`, scoped `@gomoku/<name>` | `@gomoku/core` |
| File | kebab-case of the main exported symbol, everywhere | `GameService` → `game-service.ts`, `PlayerClock` → `player-clock.tsx` |
| Domain concept folder | plural, single word, matches the event namespace | `games`, `invitations`, `lobby`, `auth` |
| Entity | PascalCase singular via `defineEntity`, in its concept folder, listed in `entities/index.ts` | `Game` → `db/src/entities/games/game.ts` |
| DB table | snake_case, plural | `games`, `game_moves` |
| DB column | snake_case (mapped from camelCase property) | `turn_started_at` ← `turnStartedAt` |
| Pure domain logic | functions/types in `core/src/<concept>/`, no I/O | `checkWin()` → `core/src/games/rules.ts` |
| Service (uses `em`) | PascalCase + `Service`, in `app/src/server/services/<concept>/` | `GameService` → `services/games/game-service.ts` |
| DI cradle key | camelCase, one explicit entry per dependency in `container.ts` | `gameService: GameService` |
| Validation schema | camelCase + `Schema`, shared client/server | `moveCreateSchema` → `core/src/validators/games/move-create-schema.ts` |
| Event ID | `concept.entity.action`, past tense | `games.move.played`, `lobby.entry.expired` |
| API route | one `route.ts` per resource under `api/<concept>/...` | `api/games/[id]/moves/route.ts` |
| Page | `<segment>/page.tsx`, default export `<Segment>Page` | `history/page.tsx` → `HistoryPage` |
| Domain error | PascalCase + `Error`, extends `AppError` | `NotYourTurnError`, `NotFoundError` |

### Where Code Goes

| Kind of code | Location | Reason |
|---|---|---|
| Game rules, clock arithmetic, state transitions, shared types | `packages/core/src/<concept>/` | Pure TS, testable without DB or Next |
| Error hierarchy, API envelope type | `packages/core/src/http/` | Shared by server wrapper and client fetch helper |
| Shared validation schemas | `packages/core/src/validators/<concept>/` | One schema for route and form |
| Domain events (types + emitter) | `packages/core/src/events/` | In-process side effects only (see OD-1) |
| Entities, migrations | `packages/db/src/entities/<concept>/`, `packages/db/src/migrations/` | Only `db` touches `@mikro-orm/*` definitions |
| Services (orchestrate `em` + core logic) | `packages/app/src/server/services/<concept>/` | They need `em`; `core` must not import the ORM |
| Route wrapper, auth guards | `packages/app/src/server/http/` | HTTP wiring, `server-only` |
| Client fetch helper | `packages/app/src/lib/api-client.ts` | Used by both route groups; not UI |
| shadcn primitives | `packages/ui/src/components/` (via `npx shadcn@latest add`) | Backend panel only |
| Generic backend-panel building blocks | `packages/ui/src/components/backend/<category>/` | Reused across `/backend` screens |
| Player-facing components (board, clock, lobby list) | `packages/app/src/components/<concept>/` | Pure Tailwind, no shadcn |
| Component used by exactly one page | colocated next to that `page.tsx` | Promote on second consumer |

### Reusable API & UI Layer (no duplicated fetch / validation / auth code)

Every route and every page reuses shared layers instead of re-inventing
fetch/validation/auth/error-handling per feature. **Build a new shared piece only when a
genuinely new pattern appears; never re-implement an existing one inline.**

**Shared types — `packages/core/src/http/`:**

- `errors.ts` — typed hierarchy: `AppError` base; `NotFoundError`, `ForbiddenError`,
  `UnauthorizedError`, `ValidationError`, `ConflictError`, plus game-specific ones
  (`NotYourTurnError`, `GameFinishedError`, `CellOccupiedError`). Services throw these;
  a service never builds an HTTP response.
- `api-result.ts` — the JSON envelope type:
  `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`.
  Both the server wrapper and the client helper import this one type — no duplication.

**Server side — `packages/app/src/server/http/`:**

- `api-handler.ts` — wraps a route handler: catches `AppError`s and maps them to status
  + envelope, logs unexpected failures, never leaks a stack trace or infrastructure
  details (hosts, ports) to the client. No route writes its own `try/catch`.
- `auth.ts` — `requireSession()` (throws `UnauthorizedError`) and participation
  assertions such as `assertIsPlayer(game, userId)` (throw `ForbiddenError`). Every
  non-public route calls one of these first, before touching a service.
- Routes call services through `withRequestScope(({ cradle }) => …)`; DB-reading
  handlers and pages call `await connection()` first.
- Route handlers are the HTTP API (the real-time client needs them). A server action is
  acceptable for a simple form submit, but it must call the same service and the same
  schema and map errors the same way.

**Client side — `packages/app/src/lib/api-client.ts`:**

- `apiCall<T>()` / `apiCallOrThrow<T>()` — the only place a `fetch()` to `/api/*` is
  allowed. Parses the envelope defensively (never `.json().catch(...)`), returns a typed
  `ApiResult<T>`, and always sets the custom header used for CSRF defense.

**Backend panel — `packages/ui/src/components/backend/`** (introduce when the first
admin screen beyond the dashboard needs them, not earlier):

- `forms/crud-form.tsx` — schema-driven form showing server `fieldErrors`,
  `Cmd/Ctrl+Enter` submits, `Escape` cancels.
- `tables/data-table.tsx` — column-config list with loading/empty/error states,
  pagination, row actions.
- `feedback/{loading-message,error-message,empty-state}.tsx` — the only sanctioned
  loading/error/empty renderers in the panel.

The player-facing frontend gets its own equivalents in `packages/app/src/components/feedback/`
(pure Tailwind, game theme from `frontend.css`). Never import shadcn components into
`(frontend)` pages and never import `frontend.css` into `(backend)`.

### Architecture

- Dependency direction is exactly `app → core, db, ui`; `db → core`; `core` and `ui`
  depend on no workspace package. `core` imports no `next`, `react` or `@mikro-orm/*`;
  `ui` imports no `db` or server code. Do not loosen this for convenience.
- A concept folder is created **only when its first file is added** — no empty scaffolds.
- **The server is the only authority over game state and the clock.** The client sends a
  move intent (`x`, `y`); the server validates it, decides win/draw/timeout and returns
  the new state. The client never sends a result, a remaining time, or a move number it
  expects the server to trust (brief: non-functional risks).
- **Game rules are pure functions in `core`.** Move validation, five-in-a-row detection
  (horizontal, vertical, both diagonals — freestyle, no renju restrictions), draw
  detection (full board) and clock arithmetic take state in and return state out. The
  service loads, calls the pure function, persists. This keeps the rules testable
  without a database.
- **The clock is computed from server timestamps, never ticked on the server.** Persist
  each player's remaining budget and `turnStartedAt`; remaining time =
  budget − (now − turnStartedAt) for the player on turn. Timeout is detected lazily on
  every read and every move (BR-05, BR-07) and finalizes the game in the same
  transaction. No `setInterval`, no background worker. Disconnection changes nothing —
  the formula keeps running (BR-06). The client clock is a display-only countdown that
  re-syncs from each server response.
- **Lobby expiry works the same way.** A lobby entry stores `expiresAt` (default 5
  minutes, BR-12, as a named constant); queries filter out expired entries — no cleanup
  job is required for correctness.
- **Concurrency is enforced by the database, not by application checks.** Moves,
  joining a game, accepting an invitation and picking an opponent from the lobby run in
  a transaction, backed by constraints: a partial unique index allowing one active game
  per user (BR-13); an invitation and a lobby entry can be consumed once. Moves are
  serialized by the `games` row lock and a conditional
  `UPDATE … WHERE move_count = :expected`; the board invariant (disjoint bitboards, stone
  count = `move_count` = `moves` length, alternating turns) is a DB `CHECK` on the
  `games` row (`bit(225)` boards + `moves bytea`, spec `2026-10-25-game-moves-win-detection`).
  There is no separate moves table.
- Game origin is stored explicitly (`invite` | `lobby`) so a future matchmaking mode is
  a new value, not a schema rethink.
- History is a read model over finished games (opponent, result, date, end reason,
  moves). It is not a separate concept folder until it needs its own entity.
- Domain events go through a typed in-process emitter in `core/src/events`, registered
  as a singleton in the container — for in-process side effects only. Pushing updates to
  clients depends on OD-1; do not assume a single server process when designing it.
- Entities are defined with `defineEntity` and listed explicitly in
  `entities/index.ts`; schema changes only through reviewed migrations.
- The app must build and boot with no database reachable (no ORM init at module level).

### Engineering Principles

Each maps to a concrete decision in this codebase. When two pull in different
directions, prefer the one that keeps the change **smaller and more explicit**.

- **SRP — one file, one reason to change.** An entity file owns columns only; a core
  rules file owns game logic only; a service owns orchestration (load → rule → persist →
  emit); a route owns HTTP wiring (auth → validation → service → envelope).
  `game-service.ts` never builds a `Response`, and `api/games/[id]/moves/route.ts`
  never checks for five in a row.
- **DRY — one definition, every call site imports it.** One schema per input, one
  envelope type, one fetch helper, one error mapper, one set of game constants
  (`BOARD_SIZE`, `WIN_LENGTH`, clock budget).
- **Separation of concerns — layers don't leak.** Persistence in `db`, rules in `core`,
  HTTP/rendering/services in `app`, panel presentation in `ui`. A page never issues a
  raw ORM query; never use the global `orm.em` for queries.
- **Dependency inversion where there is a real seam.** Services depend on cradle
  entries, not on concrete construction; Awilix wires them. Introduce a port interface
  only when a second implementation actually exists (e.g. the real-time transport once
  OD-1 is decided) — not speculatively.
- **Explicit over implicit.** `container.ts` registers every dependency by hand
  (`asClass`/`asFunction`/`asValue`), no `loadModules` globbing — it does not work in the
  bundle and keeps every binding greppable.
- **Convention over configuration, scoped narrowly.** The `<concept>/` folder convention
  only works if every concept follows it.
- **YAGNI — no speculative structure.** No matchmaking, ratings, chat, spectators, AI
  opponent or tournaments (all out of MVP scope); no folders for them; no plugin/module
  loader.
- **Composition over inheritance.** Small functions and services composed together, not
  a base `Service` class with template methods.
- **Fail closed, not open.** Any error inside an auth or participation check is a
  denial. An ambiguous "is this user a player of this game" is a 403, not a 200.
- **Idempotency where retries can happen.** A move retried after a dropped connection
  must not be applied twice — the conditional `UPDATE … WHERE move_count = :expected`
  plus the client sending the number of the move it is making makes a stale retry a safe
  conflict, and an identical retry (same number, same cell, same player) returns the
  current state, even when that move ended the game.
  Finalizing a game (win/draw/timeout) happens exactly once.

### Security & Validation — Minimum Requirements

Mechanism-specific details depend on OD-2; the requirements below do not.

- **Passwords (if own credentials):** `argon2id` (memory ≥ 19 MiB, iterations ≥ 2,
  parallelism 1) or `bcrypt` with cost ≥ 12. Pick one in the auth spec.
- **Sessions/tokens:** secret ≥ 32 random bytes from env, never committed; short expiry;
  no silent lifetime extension in place of a refresh flow.
- **Cookies:** `httpOnly`, `secure` in production, `sameSite=lax` (or `strict`), scoped
  `path`. Never put a session token in `localStorage`.
- **CSRF:** cookie auth means every state-changing route needs a defense — `sameSite`
  cookies plus a required custom header (set by `apiCall`) is the minimum bar.
- **Rate limiting:** login, register and any password reset need a brute-force control;
  joining by invitation code needs one too (code guessing).
- **Participation over roles.** No RBAC in player flows: only a participant can read
  private game state or move, only on their turn, only while the game is active; a user
  can only withdraw their own lobby entry. The `/backend` panel requires an explicit
  admin check — never "logged in" alone.
- **Invitation codes** are generated with a CSPRNG, long enough to be unguessable,
  single-use, and bound to one game.
- **Mass assignment:** a route never spreads the raw body into `em.create()` /
  `em.assign()`; it uses the schema's parsed, explicitly typed output, so a client can't
  set `status`, `winnerId`, `remainingMs` or a player ID.
- **Injection:** persistence goes through MikroORM entity/query APIs; no raw SQL or
  Kysely `sql` with interpolated user input.
- **Secrets & logging:** secrets only via env (list in `.env.example`), `.env*` with
  real values never committed; logs never contain passwords, tokens or session IDs.
- **Auth error messages:** generic ("invalid credentials"); never reveal whether an
  email is registered. Registration follows the same rule: a taken e-mail (also when the
  display name is taken too) gets one uniform `409` without `fieldErrors`; only a taken
  display name, which is public anyway, is reported at its field. The hash is computed
  before the write on both paths, so response time does not depend on whether the e-mail
  exists.
- **IDs:** UUIDs for user-visible records — no sequential enumeration of games or users.
- **Dependency hygiene:** `npm audit` in the validation gate; no dependency for what 20
  lines of local code cover; new libraries need approval (OD-3).

### Code Quality

- TypeScript strict; no `any` — narrow unknown values at runtime.
- Identifiers and comments in English; UI copy in Polish.
- Self-documenting code; a comment only for a non-obvious *why*.
- Three similar lines are fine; a copy-pasted block with branching logic is not.
- One level of abstraction per function; early returns instead of nested `if`s.
- No empty `catch` — handle, log with context, or rethrow.
- No magic numbers — name the constant and say why the value (`CLOCK_BUDGET_MS`,
  `LOBBY_ENTRY_TTL_MS`, both from the brief).
- Booleans read positively (`isFinished`, not `!isNotFinished`); a bare `true`/`false`
  argument becomes a named option or a separate function.
- No dead code, commented-out code or debug `console.log` in review.
- A PR's diff traces entirely to its stated purpose — no drive-by renames or reformatting.

### Code Review Checklist

#### Structure & conventions

- Files and concept folders follow the naming table; code lives where the "Where Code
  Goes" table says.
- No import breaks the dependency direction or reaches into another concept's internals
  instead of its service.
- New routes use `api-handler` + auth guards; new client calls use `apiCall`; panel
  forms/lists use the shared backend components — anything bespoke has a stated reason.
- No shadcn in `(frontend)`, no `frontend.css` in `(backend)`.
- `npm run check` passes; DB changes verified with migrations up **and** down on real
  PostgreSQL; UI changes checked in `npm run dev` including edge cases.

#### Security fundamentals

- [ ] Auth enforced **server-side** on every non-public route. (blocker)
- [ ] Authorization checks **the specific record** — is this user a player of *this*
  game, is it *their* turn, is it *their* lobby entry. (blocker)
- [ ] Game state, result and clock are decided server-side; nothing client-supplied is
  trusted for them. (blocker)
- [ ] Every check-then-act on shared state (move, join, accept invitation, pick from
  lobby, one active game) is protected by a transaction and/or a unique constraint.
  (blocker)
- [ ] No secret, token or password in a log line, error response or client payload.
  (blocker)
- [ ] No untrusted input reaches a query, shell command or file path unparameterized.
  (blocker)
- [ ] Write endpoints parse an explicit schema — no mass assignment. (blocker)
- [ ] Security-relevant error handling fails **closed**. (blocker)
- [ ] Cookie flags preserved whenever auth-cookie code is touched. (major)
- [ ] Brute-force control present on login/register/reset/invitation join if touched.
  (major)
- [ ] A security bug fix ships with a regression test that fails without the fix. (major)

#### Correctness & tests

- Game rules in `core` have unit tests for every win direction, board edges, occupied
  cells, moves after the game ended, and the full-board draw.
- Clock logic has tests for timeout on read, timeout on move, and time running during
  disconnection.
- Race-sensitive flows (double move, two users picking the same lobby entry, accepting
  an invitation twice, second active game) have an integration test of the concurrent
  case, not only the happy path.
- A behavior change ships with a test that fails on the pre-change code.

---

## 2. How to Add a New Domain Concept (for the agent)

Start from the spec in `.ai/specs/`. Then, creating only the files the concept needs:

1. Pure logic and types → `packages/core/src/<concept>/`, with unit tests.
2. Entity → `packages/db/src/entities/<concept>/<name>.ts`, add it to
   `entities/index.ts`, generate the migration (`npm run db:migration:create`), review
   it, apply it, and verify `up` and `down`.
3. Validation schema → `packages/core/src/validators/<concept>/<name>-<action>-schema.ts`
   once there is an input to validate.
4. Service → `packages/app/src/server/services/<concept>/<name>-service.ts`, constructor
   `({ em, ... }: Deps)`, registered explicitly in `container.ts` with the right lifetime
   (scoped when it needs `em`) and typed in `AppCradle`/`RequestCradle`.
5. Events (if any) → `core/src/events` with `concept.entity.action` IDs, emitted by the
   service after a successful commit.
6. HTTP → `packages/app/src/app/api/<concept>/.../route.ts`: `await connection()`,
   `api-handler`, auth/participation guard, schema parse, `withRequestScope` → service.
   Never a bare `try/catch` + manual `Response.json`.
7. Pages → `(frontend)` for players (Tailwind, `app/src/components/<concept>/`) or
   `(backend)/backend/...` for the panel (`@gomoku/ui` components). Fetch through
   `apiCall`; reuse the shared feedback components.
8. Never create `modules/<concept>/`, per-concept `setup.ts`/ACL files, or any
   auto-discovery mechanism.

---

## 3. Relation to `AGENTS.md`

`AGENTS.md` links to this document from its conventions. Rules that every task must
follow (stack, dependency direction, DI, ORM, workflow) live in `AGENTS.md`; this
document holds the detail. When a rule here becomes universally binding, move a
one-line version into `AGENTS.md` rather than duplicating paragraphs.

---

## 4. Target Package Structure (MVP)

Illustrative — folders appear only when their first file does.

```
packages/
  app/
    src/
      app/
        (frontend)/
          page.tsx                                  # landing / entry to lobby
          login/page.tsx
          register/page.tsx
          lobby/page.tsx                            # open lobby, "looking for a game"
          invite/[code]/page.tsx                    # join via invitation link
          games/[gameId]/page.tsx                   # board + both clocks
          history/page.tsx
          history/[gameId]/page.tsx                 # finished game replay
        (backend)/
          backend/page.tsx                          # panel dashboard
          backend/users/page.tsx
          backend/games/page.tsx
        api/
          health/route.ts
          auth/...                                  # shape depends on OD-2
          games/route.ts                            # create game (invite path)
          games/[id]/route.ts                       # game state incl. computed clocks
          games/[id]/moves/route.ts                 # play a move
          invitations/[code]/accept/route.ts
          lobby/route.ts                            # list / join / leave lobby
          lobby/[entryId]/accept/route.ts           # pick an opponent
      components/
        games/{board.tsx,player-clock.tsx}
        lobby/lobby-list.tsx
        feedback/{loading-message,error-message,empty-state}.tsx
      lib/
        api-client.ts
      server/
        container.ts
        http/{api-handler.ts,auth.ts}
        services/
          health-service.ts
          auth/user-service.ts
          games/game-service.ts
          invitations/invitation-service.ts
          lobby/lobby-service.ts

  core/
    src/
      di.ts
      http/{errors.ts,api-result.ts}
      events/{event-bus.ts,event-map.ts}
      games/
        rules.ts                                    # BOARD_SIZE, WIN_LENGTH, win/draw
        clock.ts                                    # remaining time, timeout
        game-state.ts                               # state transitions
      validators/
        games/move-create-schema.ts
        auth/register-schema.ts

  db/
    src/
      entities/
        index.ts
        auth/user.ts
        games/game.ts                               # origin: invite | lobby, status, result
        games/game-player.ts                        # color, remaining budget
        games/game-move.ts                          # move_number, x, y
        invitations/invitation.ts                   # code, single-use
        lobby/lobby-entry.ts                        # expires_at
      migrations/

  ui/
    src/
      components/                                   # shadcn primitives (npx shadcn add)
        backend/                                    # generic panel building blocks
          forms/crud-form.tsx
          tables/data-table.tsx
          feedback/{loading-message,error-message,empty-state}.tsx
      styles/globals.css
```

No new packages and no new boundaries — only concept sub-folders inside the existing
four packages.

---

## 5. Migration Steps (current repo → this structure)

One buildable step at a time; `npm run check` after each.

1. Rename `packages/core/src/game/` → `packages/core/src/games/` (concept folders are
   plural) and update the re-export in `core/src/index.ts`. Do it together with the
   first real game-logic change, not as a standalone move.
2. Add `core/src/http/` and `app/src/server/http/` + `app/src/lib/api-client.ts`
   together with the first domain route, which becomes the reference example later
   routes copy. `/api/health` keeps its own response shape (`{ status, database }`,
   used by `npm run smoke`) and is not moved onto the envelope.
3. OD-2 and OD-3 (`zod`) are resolved (section 0); resolve OD-1 before the
   lobby and live game screens.
4. Add `core/src/events/` with the first feature that emits an event — not before.
5. Add the backend panel components in `ui/src/components/backend/` with the first
   admin list/form screen — not before.
6. For every concept from here on, follow Section 2.
