# MODULE — `packages/database`

Module contract, adopted from the review of 2026-11-13 (run A). Paths that begin with `A/` or `inputs/` cite the review record, which is kept outside this repository. Written by a helper on Opus 5.5 from the R1 reports and the code at `ef1bd0ef5`; reviewed by the main session on Fable 5.2, which re-read: the tenant transaction and its settings, the two pools, the rule against a second transaction inside the first, the build invariant and the list of row-policy tests. The counts of call sites and the other invariants are those of the R1 reports and were not re-read. Rules of `AGENTS.md` that bind this area: R-06, R-12, R-13, R-16, R-17, R-35. Line numbers into `docs/engineering/DIRECTION.md` are those of 2026-11-17, 01:00Z; the work-package numbers are the stable reference. **Corrected in R3 (2026-11-17)** after the independent review of R2b (comment R2b-C03): every statement of this file was checked against the pinned commit and the active finding records by a helper on Opus 5.5 (`A/raw/R3/modules/modcheck.md`), and the main session re-read the lines behind each correction it took. "Owned" means the package whose exported commands should write a table; `packages/database` declares every table and owns commands for the pilot category of `tenant_settings` (R-16).

## Responsibility

Declares the schema (46 schema files, 99 `pgTable` calls — MEASURED, `rg -c 'pgTable\(' packages/database/src/schema/*.ts` — for 97 table names, because `claim_messages` and `claim_counters` are declared twice, DATA-09), owns the two connection pools, and is the only place that opens a tenant transaction with the row-security settings. It also owns migrations, seeds, the seed-target guard and the pilot switch settings.

The seed runner uses the internal `src/seed-receipt.ts` module to build and print receipts. The module uses no database client.

## Public API

`package.json:7-30` declares 22 subpath exports (recounted in R3) (root `./src/index.ts`, plus `./schema`, `./db`, `./tenant-authority`, `./tenant-security`, `./ingress`, `./testing/tenant-authority`, …). The entries other code should use: `withTenantAuthority` (`src/tenant-authority-context.ts:12-18`), `withTenantContext` / `withTenantDb` (`src/tenant.ts:23-55`), `dbAdmin` and `dbRls` (`src/db.ts:244-251`), `withTenant` (`src/tenant-security.ts:22-37`). Transaction-scoped advisory locks live here so their raw statements stay inside the database package: `./branch-policy-lock`, `./sponsor-locks` and `./claim-evidence-object-lock` (`lockClaimEvidenceObjects`, one lock per stored evidence object of a tenant, taken in ascending order of the 64-bit lock ids; it refuses a transaction that is not READ COMMITTED, since its callers' re-read must see the previous holder's commit).

The `./free-start-drafts` subpath also exports `withPrincipalTenantContext` for session-bound actor settings. This keeps the actor transaction helper out of the root barrel's import graph.

`@interdomestik/database/pilot-switch` exposes `readPilotSwitch`, `assertNewSalesOpen` and the `changePilotSwitch` command for the `tenant_settings` category `pilot`. The switch reader uses the caller's tenant transaction. The writer derives the access tenant and acting principal from the supplied authority and records the change in the same transaction.

`@interdomestik/database/free-start-drafts` exposes `readFreeStartDraftIntakeOpen` for create and update admission using the same session context as the draft repository.

The lead-approved `@interdomestik/database/seed-target-classification` export exposes the pure `readDisposableTargetClass` for deployment classification. Both runtime database URLs must be explicitly disposable, and production target evidence is refused. Seed commands retain their separate refusal for `NODE_ENV=production`.

## Owned tables

WP-09 PR 1 declares the dormant Billing import assignments, lists, rows, contract years, seats, employer exits, notice obligations and token hashes in new schema modules. Migration `0109_wp09_import_assignment_capacity` enables and forces access-tenant RLS and grants only the operations admitted by each table's policy. Billing owns the records and their future commands. The restricted-role proofs run in the database `test:rls` lane on a disposable journal-built database.

The policies use the session principal settings from `withPrincipalTenantContext`. Assignment scope filters staff reads through the list, row and seat chain. The migration grants `SELECT` and `INSERT` to `interdomestik_runtime_rls`, with column-level updates for assignment revocation, the exact-list decision and the contract year's current limit. Provision the runtime role before this migration so it receives those grants. WP-04 admission covers the SQL-managed FORCE RLS, supporting indexes, cross-module foreign keys and agreement-window exclusion.

Migration `0106` adds the WP-12 tables declared at the schema barrel tail. `claim-correspondence` declares `claim_authorities`, `claim_correspondence` and `claim_correspondence_documents`, and `claim-case-fields` declares `claim_case_fields`. Their composite foreign keys to `claim` use the unique `(tenant_id, id)` index created by WP-11's migration `0105`. The correspondence integration suites cover these tables under the restricted role.

This package _declares_ every table — the schema module is the only declaration site for the 97 tables, and R1 names 91 as tenant tables (`A/modules/tenancy.md:213-218`, TEN-01) — and it carries the migrations, the seeds and the row policies. Declaring is stewardship of the schema; the owner of a table is the domain package named in that package's `MODULE.md`, and the owner map of CHK-16 is the list (R-16). The R2b text said "all of them", which made every table owned twice (review comment R2b-C03). Two tables that no contract named are assigned by this review: `share_packs` to the documents area, and `case_scoped_access_grants` to `domain-claims` (TEN-03: the only code that inserts a grant, `packages/domain-claims/src/claims/jurisdiction-handoff-store-insert.ts:31`, has no production caller today; the claims contract lists the table since the closing pass). Every domain package and `apps/web` write through the exported transaction handle (902 of 996 Drizzle call sites take a transaction handle; 52 take `db`/`dbRls`, 42 take `dbAdmin` — MEASURED in `A/modules/tenancy.md:84-100`). The schema is not the whole truth: 33 indexes, 11 triggers, 12 functions and 1 exclusion constraint exist only in SQL (DATA-05; recounted in R3, `A/raw/R3/corrections/c13-recounts.json`), which is why the build check compares with the schema **and** a registry of those objects (R-12, CHK-12).

This package owns commands for the `pilot` category of `tenant_settings` (WP-10).

## Invariants

- A tenant transaction sets `row_security = on` and the two tenant GUCs before the callback — enforced in code, `src/tenant.ts:34-44`.
- The database role of a tenant transaction comes only from deployment configuration, never from a caller — `src/tenant.ts:17,29`, with the identifier regex-validated (`src/rls-role-assertion.ts`, cited by `A/modules/tenancy.md:150`).
- `withTenantAuthority` refuses anything that is not a registered authority token — `src/tenant-authority-context.ts:16`.
- An absent or malformed pilot switch is closed at revision 0. A flip uses a revision comparison under the row lock or a first-insert conflict check. Opening requires a super admin's approval reference. The writer and audit row commit together under the access tenant.
- **Code inside a tenant transaction must use that transaction and never open a second one.** Each call opens its own transaction (`src/tenant.ts:23-47`) and on the hosting platform each pool holds one connection (`src/db.ts:40-41`), so a nested call cannot complete. `NOT ENFORCED` by any check; two pilot paths break it (DATA-13): `apps/web/src/app/[locale]/(app)/member/membership/_core.ts:57,82` calling `apps/web/src/lib/entity-disclosure.core.ts:76`, and `apps/web/src/features/admin/verification/server/mutations/verify-attempt.ts:92,166` calling `apps/web/src/lib/notifications/recipient-role.ts:18`.
- A built database equals the declared schema — checked by `test:journal-parity` (WP-04, CHK-12): a database built from the journal alone is compared with the snapshot rendered by PostgreSQL plus the registry of SQL-only objects (`scripts/ci/sql-managed-objects.json`), with the reviewed differences pinned in `test/journal-schema-parity.support.ts`. It runs in CI at the end of the E2E gate job's "Prepare E2E Database" step, on the job's loopback database, with `REQUIRE_JOURNAL_SCHEMA_PARITY=1` so that a missing database fails instead of skipping (approved by the owner). The four `.sql` files that were outside the journal (DATA-14) are carried by the journaled `drizzle/0100_*.sql`, which refuses a pre-existing object that is not equivalent.
- Role is one of a fixed set — `NOT ENFORCED` (`src/schema/auth.ts:19`, no CHECK/enum; `A/modules/data-layer.md:115`).
- Claim amounts in a declared currency — `NOT ENFORCED` (`src/schema/claim-core.ts:53-54`; `A/modules/data-layer.md:125`).
- The document access log is append-only — `NOT ENFORCED`, comment only (`src/schema/documents.ts:78-105`; `A/modules/data-layer.md:133`).
- Migration order — enforced by `db:migrations:check-journal` (`scripts/check-drizzle-migration-journal.mjs`): every `.sql` file under `drizzle/` is journaled, and timestamps increase with the index except the one pinned historical inversion (DATA-02).
- No schema push outside the journal — checked by `scripts/ci/schema-push-search.test.mjs` (CHK-12), a mistake-prevention check: it catches an accidental schema-push invocation and does not claim to stop a deliberately disguised one. Enforcement rests on the journal parity check above, migration 0100, CHK-13's disposable-target guard and the removed `push`/`db:push` scripts. Package scripts and shell scripts are read as the shell reads them, and no command in them may push a schema (`supabase … db … push`, `drizzle-kit … push`, a package script named `push` or `db:push`). In Node, TypeScript and workflow files every mention of `supabase` or `drizzle-kit` is pinned by the sha256 of its line (`scripts/ci/schema-push-mentions.json`), and `scripts/database-command.mjs` (the one `push-local` invocation, `--local` only) is pinned byte for byte. Known limits: shell parameter expansions, redirections glued to a word, interpreters inlined in a package script, and test bodies (CHK-12 skips every test file). CHK-13 (`scripts/ci/own-database-client-scripts.json`) inventories database clients in script files and in the pg16 test files, but not in workflow YAML, under `packages/*/scripts/` (which CHK-12 does count for push-tool mentions) or in other test files: a database client such as `psql` in those places is in neither inventory.
- One stored evidence object `(tenant_id, bucket, file_path)` is the document of at most one claim — `NOT ENFORCED` by the database (the unique index `claim_documents_tenant_claim_id_uq` includes the row id). An application guarantee for the two writers that take client-named upload paths, draft update and submit in `domain-claims`: both take `lockClaimEvidenceObjects` and re-read inside their write transaction (READ COMMITTED, checked by the lock). A database constraint needs an audit of existing rows first (owner follow-up).
- (Full list: `A/modules/data-layer.md:109-140`, 21 rows.)

## Tenant boundary

Tenant context enters only as a `TenantAuthority` token or a resolved `TenantContext` (`src/tenant-context-resolution.ts` via `src/tenant.ts:27`), is set as `app.current_tenant_id` / `app.current_access_tenant_id` inside the transaction (`src/tenant.ts:37-41`), and is backed by row policies. Statement-level scoping is a convention, not a wrapper: 11.0% of call sites use the scoped helper, 68.7% a hand-written `eq(table.tenantId, …)`, 20.3% carry no tenant token and rely on policies alone (MEASURED, `A/modules/tenancy.md:88-92`). Bypass paths: R1 ruled out client-supplied tenant, session tampering, proxy, caches, share packs and file download; `dbAdmin` is UNVERIFIED for 13 of 19 using files, and raw SQL for all but 8 sites (`A/modules/tenancy.md:146-170`). **No confirmed leak** (`A/modules/tenancy.md:172`). The identity library does not use the tenant pool: it binds the privileged one (`apps/web/src/lib/auth/schema.ts:6`).

## Live and not live

Live: the tenant pool and `withTenantAuthority`; the journal migrator; the seed-target guard (`src/seed-target-guard.ts:210,217` — refuses a non-local target without `SEED_TARGET_CONFIRM=plan070:<target>`, and so admits any confirmed remote target; it knows production by one constant, `:10` — DATA-04); for destructive scripts, `assertDisposableTarget` (`:236`) admits only a loopback database or the confirmed CI container (WP-04, R-13), and `src/disposable-client.ts` is the one client factory a destructive script may use: it classifies the URL with the driver's `PG*` environment before it opens a connection. Not live: a second migration runner, 23 files / 2,303 lines, wired to nothing (DATA-11, `src/migrate.ts` is the live one); `supabase/migrations/` for storage, applied by no workflow (`docs/engineering/DB-BASELINE.md:122`). No repository-visible step migrates any deployed database (DATA-03).

## A new tenant table (added after the drill of R3)

Declare it in a schema file with its tenant column, its policy and `.enableRLS()`; the model is `src/schema/claim-information-requests.ts:35-102`: `using` compares the tenant column with the setting `app.current_tenant_id`, and `withCheck` also proves that the parent row is of the same tenant. `pnpm db:generate` then writes the migration with `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` (model: `drizzle/0093_s4_claim_information_requests.sql:19,26`), its snapshot and its journal entry (R-12). Runtime grants normally come from the environment (`docs/engineering/DB-BASELINE.md`, part 11). Two tests cover a tenant table: `test/rls-coverage.test.ts` checks that RLS is enabled, and a table-specific test in the `test:rls` lane proves the policy.

`exchange_rate_books` and `exchange_rates` are owned by the membership billing payment port. Legal entities are created through the admin path by seeds and migrations. The book provisioning trigger runs with the inserting role's privileges. Migration `0101` backfills existing entities before forcing RLS on both tables and sets the runtime privileges when the role exists. The book lock requires column-level `UPDATE` on `id`. A trigger rejects updates, deletes and truncation on both tables.

Migration `0102` declares the membership billing port's plan versions, sale kinds and channels, sale claims, sales and ledger entries. The billing module owns the commands and invariants. `test/exchange-rates.fixture.ts` shares the journal-built scratch database fixture with the billing restricted-role lane.

Migration `0104` declares the membership billing port's `exchange_rate_verifications` and `exchange_rate_verification_limits` in `src/schema/exchange-rate-verifications.ts`. The journal snapshot tracks both tables. The SQL-managed registry tracks their FORCE RLS, the two invoker trigger functions and the three new triggers. Both tables enable and force access-tenant RLS. Runtime can select and insert verifications and can only select limits. The verification insert trigger takes the book lock before the entity lock and stamps evidence at `READ COMMITTED`. The verification mutation trigger reuses the rate append-only function.

The individual sale age trigger runs after `membership_sales_individual_insert` and `membership_sales_void_state`, before charge posting. It uses the database-stamped `sold_at` and returns the existing named stale-rate violation to 0103. The guarded release operation serializes limit writes with sales through the book lock and appends the audit receipt in the same transaction. `src/scripts/set-rate-verification-limit.ts` is the sole production caller of the internal writer. Billing tests import `test/exchange-rates-release.fixture.ts` by relative path. The `test/exchange-rates.fixture.ts` fixture takes its release client from `test/exchange-rates-release-client.fixture.ts`. PG16 restricted-role proofs run in the database and billing `test:rls` lanes, with the split-tenant action receipt covered by the web PG16 Vitest invocation.

After an uncertain commit, the release pipeline first runs the same CLI with `--check-receipt` and the original operation arguments. The lookup uses a read-only `READ COMMITTED` transaction under the same tenant binding as the write. Both paths refuse a session login or effective role that is a superuser, has `BYPASSRLS`, owns either `audit_log` or `exchange_rate_verification_limits`, or is a member of either table's owner role. The lookup returns a matching receipt with the prior and applied limits, a conflicting receipt, or `absent` with the current limit. Before relying on `absent`, the operator must establish that the original release transaction has ended by confirming its connection is closed or that the transaction no longer appears in `pg_stat_activity`. The operator must then re-run the lookup. If it still reports `absent`, the operator must re-decide with the current limit in view. Blindly retrying a set could reopen sales after a later removal.

If production creates `interdomestik_runtime_rls` after migration `0104`, the external release bootstrap must apply these migration ACLs for both tables.

```sql
REVOKE ALL ON public.exchange_rate_verifications, public.exchange_rate_verification_limits
  FROM interdomestik_runtime_rls;
GRANT SELECT, INSERT ON public.exchange_rate_verifications TO interdomestik_runtime_rls;
GRANT SELECT ON public.exchange_rate_verification_limits TO interdomestik_runtime_rls;
```

WP-11 adds five tables, each declared in its own module exported before the WP-12 modules in `src/schema/index.ts`:

- `notification_deliveries` and `claim_response_requests`;
- `user_locale_preferences`: the recipient locale, one row per user;
- `support_handoff_first_responses`: the first public response time, one row per handoff;
- `notification_preview_restrictions`: the sticky preview flag, one row per inbox notification that WP-11 created.

No WP-11 column is added to an existing table. The owning domain is `domain-communications` for deliveries, locale preferences and preview restrictions, and `domain-claims` for response requests and first responses.

Their foreign keys and the composite unique indexes they target, on `claim`, `claim_messages`, `notifications` and `support_handoffs`, are SQL-managed:

- They are declared only in migration `0105`, not in Drizzle.
- Each is registered in `scripts/ci/sql-managed-objects.json`.
- Each deletes with its parent (`ON DELETE CASCADE`), so seed and test cleanups need no extra step.
- The exception is `claim_response_requests.answered_by`, which is set to null when its user is deleted.

The five tables force RLS. The runtime role has no `DELETE` on any of them. It has no `UPDATE` on first responses or preview restrictions, so a restriction never changes once written.

## Tests to run

`test/pilot-switch.test.ts` covers the reader and command with a fake transaction. `test/pilot-switch-rls.test.ts` is in the `test:rls` lane and proves tenant isolation, revision conflicts and atomic audits under the restricted role.

From `package.json:31-48`: `pnpm --filter @interdomestik/database test:unit`; `test:rls` (an explicit list of 24 test files at `:42`, the row-security and tenant-authority suite; the other 124 of the 148 files run in no workflow, TEST-03); `test:migration-runtime-role`; `test:journal-parity` (needs a disposable PostgreSQL 16 server); `type-check`; `seed:assert-e2e`. `test:rls` runs in CI (`.github/workflows/ci.yml:196`, `pnpm db:rls:test`, with `REQUIRE_RLS_INTEGRATION=1` and `REQUIRE_RLS_COVERAGE=1`) and `seed:assert-e2e` in the same job; no workflow step runs this package's `test:unit`, `test:migration-runtime-role` or `type-check` (the unit's search of the workflows, which agrees with TEST-03); `A/modules/data-layer.md:246` records that no workflow has a migration step (DATA-03).

## Do not reach into

`@interdomestik/database/db` for `dbAdmin` from a domain package or a feature — there is a test for it (`test/no-domain-db-admin-import.test.ts`, `package.json:42`). The `db` alias of the tenant client (`src/db.ts:254-255`) — it is kept only for backwards compatibility and is one of the three coexisting tenant-entry generations (TEN-05). The caller-built `{ tenantId }` form of `withTenantContext` (8 calls in 7 files, `A/modules/tenancy.md:95`).

## Open findings

DATA-02 to DATA-09, DATA-11, DATA-12 (`A/modules/data-layer.md:239-252`), DATA-13 and DATA-14 (`docs/engineering/DB-BASELINE.md:18,89`), TEN-01…TEN-05 (`A/modules/tenancy.md:215-221`), SEC-12 (S3 since R3) and SEC-13 (`docs/engineering/DB-BASELINE.md`, part 12). Work packages: WP-04 and WP-15 for the build path, the role settings and the seed guard (`docs/engineering/DB-BASELINE.md:210-220`); WP-17 for the rehearsal and storage.
