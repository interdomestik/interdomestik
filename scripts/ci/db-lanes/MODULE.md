# Database test lanes

Run `node scripts/ci/db-lanes/inventory.mjs` from the repository to print the tracked file inventory. CI reads the same inventory before launching the advisory tests. Stage new tests before checking their selection locally.

The inventory records the explicit RLS and journal parity selectors in `ci.yml` and their runners on broad CI. It also records the two mock-based source suites in the coverage lane, which runs when CI cannot reuse coverage. These entries describe selection. On broad pull-request runs, the separate advisory job reports its own execution by file and counts passing, failed, skipped, TODO, cancelled, and retried cases.

The advisory job runs database-package TypeScript tests with Node. Top-level tests run without a database unless they use a live fixture or a database test suffix. Nested tests under `packages/database/test/pg16/` run on the job's journal-built PG16 service. Use `.rls.test.ts`, `.postgres.test.ts`, `.pg16.test.ts`, or `.integration.test.ts` for new database suites in `apps/web/src/` or `packages/domain-*/src/`. These suites run with the owning project's Vitest configuration. The web config also accepts `.tsx`. Use the existing fixture appropriate to the suite and assert the effective role where required. Each exclusion specifies the file, reason, owner, and removal condition.
