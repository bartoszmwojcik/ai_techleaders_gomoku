# Right after `docker compose up` the port accepts connections before PostgreSQL does

**Problem.** The CI job `setup` failed on `main` (run 39308725508), though it had passed on the PR. Right after the container started, the `db:status` probe got `Connection terminated unexpectedly`, an error from the `pg` driver without a `code`. It was classified as `other` (a configuration error), and the installer stopped instead of waiting.

**Context.** Docker's port proxy accepts the TCP connection on the host as soon as the container starts, then closes it while PostgreSQL inside isn't listening yet (initdb on a fresh volume). Reproduced locally: 1 probe in 40 on a fresh container fell into that window. It's a race, so it shows up only intermittently.

**Rule.**
- When classifying connection errors, transient states (`Connection terminated…` without a code, `57P01`, `57P03`, `ECONN*`) are "unreachable, wait"; only explicit rejections (auth, missing database) stop at once.
- Test any classification of DB startup states against a **fresh** container, in a loop, not with a single run: an end-to-end test passing once proves nothing about a race.

Related: `.ai/specs/2026-10-19-npm-setup-installer.md`, PR #8.
