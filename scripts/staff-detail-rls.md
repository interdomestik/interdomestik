# Staff detail restricted SQL proof

Run `pnpm db:rls:test:staff-detail` from the repository root with `E2E_DATABASE_URL`
(or `DATABASE_URL`) pointing at the migrated restricted-lane test database. Only
`127.0.0.1` with database `interdomestik_test`, or local Supabase on port 54322 with
database `postgres`, is accepted. Supply credentials through the environment;
the runner does not read environment files or print connection strings.

Dependencies must already be installed. The administrative credential must be able
to provision the existing E2E runtime LOGIN using `scripts/e2e-runtime-role.mjs`.
Leave `DB_RLS_ROLE` unset. An optional `E2E_SERVER_DATABASE_URL_RLS` must satisfy
that helper's restricted-role and same-database checks. The proof creates and
removes isolated tenants, users, claims and history; prior E2E seeding is unnecessary.
The shared `interdomestik_e2e_runtime` LOGIN and its grants are provisioned in place and
remain after success or failure; other restricted lanes use the same role, so the runner
never drops it. The proof flags are child-process environment variables only.

The runner requires a fresh restricted login before starting the single Vitest file,
sets `REQUIRE_RLS_INTEGRATION=1` and `S8_STAFF_DETAIL_DB_PROOF=1`, and supplies a run
token and a single-connection pool. The test overrides the web unit configuration's
inert database URL before importing database code. Missing/unreachable databases,
unsafe roles, missing prerequisites and failed assertions exit nonzero; invocation
through this script cannot take the ordinary unit suite's opt-out path.

Root `pnpm db:rls:test` runs the database and communications RLS suites, then this
staff-detail proof, sequentially with `&&`; any failure fails the command. Under
owner-approved D2 (2026-11-10, SRS v0.9 IDA-SEC-002/003), the proof is required
wherever that root command runs.

The `RLS Integration Test` step in `.github/workflows/ci.yml` already calls
`pnpm db:rls:test` after migration. Its job-local `DATABASE_URL` targets
`127.0.0.1:5432/interdomestik_test`, which satisfies the runner's loopback and
synthetic-database guards; no workflow edit is needed. `pnpm pr:verify` calls
`pnpm db:rls:test:required`, which sets the integration and coverage requirements and
delegates to the same root command through `scripts/run-with-default-db-url.mjs`; its
default `127.0.0.1:54322/postgres` and the isolated `127.0.0.1:55438/interdomestik_test`
lane both satisfy the guard. The workflow call and root command chain are asserted by
`scripts/ci/ci-audit-rls-workflow-contracts.mjs`.

Known limitation: Z620's `db-rls-required` gate runs the same command against a
task-owned `interdomestik_ci_*` database. This runner, like the existing communications
RLS suite, refuses that name, so Z620 cannot pass this gate until its lane and these
guards are reconciled. Z620 is not gate evidence; CI and the Mac `pr:verify` lane are.
