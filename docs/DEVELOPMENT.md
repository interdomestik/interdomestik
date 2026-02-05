# Development (local)

## Daily workflow

- Start dev servers: `pnpm dev`
- If you need to bind explicitly to loopback: `cd apps/web && pnpm dev:local`
  - Note: avoid `pnpm dev -- --hostname ...` because Next treats `--` as end-of-options and misreads `--hostname` as a positional project directory.
- Run unit tests: `pnpm test`
- Run fast quality gate (recommended before pushing): `pnpm check:fast`
- Run CI-equivalent gate: `pnpm check`

## Quality gates

The repo standardizes checks so everyone runs the same commands:

- `pnpm format:check`: verifies Prettier formatting
- `pnpm lint`: lints via Turborepo pipelines
- `pnpm type-check`: TypeScript typechecking via Turborepo pipelines
- `pnpm i18n:check`: validates i18n keys/usage
- `pnpm test`: web unit tests (Vitest)
- `pnpm build`: builds all packages/apps
- `pnpm pr:verify`: **The Canonical PR Contract**. Runs gatekeeper, build, and smoke tests.

## PR Verification Contract

To ensure high-discipline standards and "Golden Path" compliance, all PRs must pass the `pr:verify` command before being considered for merge.

```bash
pnpm pr:verify
```

This command executes:

1.  **Gatekeeper (`scripts/m4-gatekeeper.sh`)**: Resets DB to deterministic state and builds production-like standalone web artifact.
2.  **Fast E2E Gate**: Runs critical path tests for KS and MK tenants.
3.  **Smoke Tests**: Final sanity check for core functionality.

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
