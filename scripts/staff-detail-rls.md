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

The runner requires a fresh restricted login before starting the single Vitest file,
sets `REQUIRE_RLS_INTEGRATION=1` and `S8_STAFF_DETAIL_DB_PROOF=1`, and supplies a run
token and a single-connection pool. The test overrides the web unit configuration's
inert database URL before importing database code. Missing/unreachable databases,
unsafe roles, missing prerequisites and failed assertions exit nonzero; invocation
through this script cannot take the ordinary unit suite's opt-out path.

No CI wiring is included. The lead can append ` && pnpm db:rls:test:staff-detail`
to the existing `run: pnpm db:rls:test` line in the `RLS Integration Test` step of
`.github/workflows/ci.yml`. Its existing migrated test database supplies `DATABASE_URL`.
That workflow line is also asserted by `scripts/ci/ci-audit-rls-workflow-contracts.mjs`;
update the matching expected string in the same lead-owned change.
