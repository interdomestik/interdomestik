# Development (local)

## Daily workflow

- Start dev servers: `pnpm dev`
- If you need to bind explicitly to loopback: `cd apps/web && pnpm dev:local`
  - Note: avoid `pnpm dev -- --hostname ...` because Next treats `--` as end-of-options and misreads `--hostname` as a positional project directory.
- Run unit tests: `pnpm test`
- Run bounded edit feedback: `pnpm check:fast` (locale, entrypoint, architecture guards and the
  complete case/recovery unit suites; no DB, network, browser, build, cache wipe, or process kill).
- Run full formatting, lint, and type checks: `pnpm check:static`.
- Run full local code checks and build: `pnpm check`.
- Run the prepared PR browser lane explicitly: `pnpm slice:e2e:pr`. This migrates/reseeds the test
  database and builds the app; coordinate ownership of the test DB and port first.
- `pnpm dev:clean` refuses occupied/ambiguous port 3000; stop a known dev server from its own
  terminal, then retry. It never kills another listener or wipes caches.

`check:fast` scans the repository regardless of which files changed. Its unit portion covers case
and recovery lifecycle rules, law-pack selection, and success-fee normalization with an injected
transaction. It does not include all web/domain units, lint, type checking, or integration proof.
For focused web tests use `pnpm --filter @interdomestik/web test:unit --run <file>`; for domain tests
use the package's `test:unit` command. `pnpm db:rls:test:required` is the explicit DB integration
lane. Required PR proof below remains the merge standard.

Database engines are explicit: `pnpm db:generate` generates Drizzle SQL migrations without
applying them; `pnpm db:migrate` applies those migrations to the configured DB. `pnpm db:push:local`
applies the separate Supabase migrations with `--local` and this checkout's `--workdir`. Only
`--dry-run`, `--include-all`, and help flags are accepted; target overrides and seed flags are
refused. It does not run Drizzle schema push.

## Quality gates

The repo standardizes checks so everyone runs the same commands:

- `pnpm format:check`: verifies Prettier formatting
- `pnpm lint`: lints via Turborepo pipelines
- `pnpm type-check`: TypeScript typechecking via Turborepo pipelines
- `pnpm i18n:check`: validates i18n keys/usage
- `pnpm test`: web unit tests (Vitest)
- `pnpm build`: builds all packages/apps
- `pnpm pr:verify`: **The Canonical PR Contract**. Runs repository contracts, RLS, coverage,
  the full E2E gate, and smoke tests. `pnpm memory:precheck` is separate opt-in advisory feedback.

## PR Verification Contract

To ensure high-discipline standards and "Golden Path" compliance, all PRs must pass the `pr:verify` command before being considered for merge.

```bash
pnpm pr:verify
```

This command executes:

1. Repository/CI/release contracts, migration/RLS checks, locale and architecture guards.
2. Complete coverage, then gatekeeper migration/seed/build and the full E2E gate.
3. Smoke tests. Run `pnpm security:guard` as the other required check.

The E2E result inside a successful `pr:verify` is the required `e2e:gate` evidence for that same
source, configuration, and environment. QA `check_health`/`full` and `verify-slice --required-gates`
do not repeat it. A changed candidate or environment requires fresh proof; no persisted evidence
is automatically reused by these commands.

### Note on `pnpm test:e2e`

Currently, `pnpm test:e2e` is considered **non-contract**. While useful for local development of new specs, it may include `@quarantine` or `@legacy` tests that are not yet stable in CI. Always rely on `pr:verify` for CI parity.

## Git hooks (Husky + lint-staged)

On commit, staged files are automatically:

- formatted with Prettier
- lint-fixed (ESLint) for the Web and UI workspaces

If you need to bypass hooks (rare): `git commit --no-verify`.

## Environment Variables

We maintain a strict separation between development and testing environments.

| Variable              | Local Development       | Local E2E               | CI Environment                 |
| :-------------------- | :---------------------- | :---------------------- | :----------------------------- |
| `DATABASE_URL`        | Local Supabase/Docker   | `interdomestik_test`    | `interdomestik_test` (Service) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `http://127.0.0.1:3000` | `http://127.0.0.1:3000`        |
| `BETTER_AUTH_SECRET`  | Local secret            | `test-secret-...`       | CI Secret                      |

### Local Setup

Copy `.env.example` to `.env` and fill in the values.
For local E2E, the `playwright.config.ts` handles most defaults, but ensure your `DATABASE_URL` points to a safe test database if not using the default `interdomestik_test`.

### CI Validation

In CI, the `scripts/check-env-ci.mjs` guard runs during the `audit` job to ensure all mandatory keys are present before starting long builds or E2E suites.
