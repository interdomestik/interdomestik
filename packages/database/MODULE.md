# MODULE — `packages/database`

Module contract, adopted from the review of 2026-11-13 (run A). Paths that begin with `A/` or `inputs/` cite the review record, which is kept outside this repository. Written by a helper on Opus 5.5 from the R1 reports and the code at `ef1bd0ef5`; reviewed by the main session on Fable 5.2, which re-read: the tenant transaction and its settings, the two pools, the rule against a second transaction inside the first, the build invariant and the list of row-policy tests. The counts of call sites and the other invariants are those of the R1 reports and were not re-read. Rules of `AGENTS.md` that bind this area: R-06, R-12, R-13, R-16, R-17, R-35. Line numbers into `docs/engineering/DIRECTION.md` are those of 2026-11-17, 01:00Z; the work-package numbers are the stable reference. **Corrected in R3 (2026-11-17)** after the independent review of R2b (comment R2b-C03): every statement of this file was checked against the pinned commit and the active finding records by a helper on Opus 5.5 (`A/raw/R3/modules/modcheck.md`), and the main session re-read the lines behind each correction it took. "Owned" means the package whose exported commands should write a table; `packages/database` declares every table and owns none (R-16).

## Responsibility

Declares the schema (46 schema files, 99 `pgTable` calls — MEASURED, `rg -c 'pgTable\(' packages/database/src/schema/*.ts` — for 97 table names, because `claim_messages` and `claim_counters` are declared twice, DATA-09), owns the two connection pools, and is the only place that opens a tenant transaction with the row-security settings. It also owns migrations, seeds and the seed-target guard.

## Public API

`package.json:7-30` declares 22 subpath exports (recounted in R3) (root `./src/index.ts`, plus `./schema`, `./db`, `./tenant-authority`, `./tenant-security`, `./ingress`, `./testing/tenant-authority`, …). The entries other code should use: `withTenantAuthority` (`src/tenant-authority-context.ts:12-18`), `withTenantContext` / `withTenantDb` (`src/tenant.ts:23-55`), `dbAdmin` and `dbRls` (`src/db.ts:244-251`), `withTenant` (`src/tenant-security.ts:22-37`).

## Owned tables

**None, as an owner of commands.** This package _declares_ every table — the schema module is the only declaration site for the 97 tables, and R1 names 91 as tenant tables (`A/modules/tenancy.md:213-218`, TEN-01) — and it carries the migrations, the seeds and the row policies. Declaring is stewardship of the schema; the owner of a table is the domain package named in that package's `MODULE.md`, and the owner map of CHK-16 is the list (R-16). The R2b text said "all of them", which made every table owned twice (review comment R2b-C03). Two tables that no contract named are assigned by this review: `share_packs` to the documents area, and `case_scoped_access_grants` to `domain-claims` (TEN-03: the only code that inserts a grant, `packages/domain-claims/src/claims/jurisdiction-handoff-store-insert.ts:31`, has no production caller today; the claims contract lists the table since the closing pass). Every domain package and `apps/web` write through the exported transaction handle (902 of 996 Drizzle call sites take a transaction handle; 52 take `db`/`dbRls`, 42 take `dbAdmin` — MEASURED in `A/modules/tenancy.md:84-100`). The schema is not the whole truth: 33 indexes, 11 triggers, 12 functions and 1 exclusion constraint exist only in SQL (DATA-05; recounted in R3, `A/raw/R3/corrections/c13-recounts.json`), which is why the build check compares with the schema **and** a registry of those objects (R-12, CHK-12).

## Invariants

- A tenant transaction sets `row_security = on` and the two tenant GUCs before the callback — enforced in code, `src/tenant.ts:34-44`.
- The database role of a tenant transaction comes only from deployment configuration, never from a caller — `src/tenant.ts:17,29`, with the identifier regex-validated (`src/rls-role-assertion.ts`, cited by `A/modules/tenancy.md:150`).
- `withTenantAuthority` refuses anything that is not a registered authority token — `src/tenant-authority-context.ts:16`.
- **Code inside a tenant transaction must use that transaction and never open a second one.** Each call opens its own transaction (`src/tenant.ts:23-47`) and on the hosting platform each pool holds one connection (`src/db.ts:40-41`), so a nested call cannot complete. `NOT ENFORCED` by any check; two pilot paths break it (DATA-13): `apps/web/src/app/[locale]/(app)/member/membership/_core.ts:57,82` calling `apps/web/src/lib/entity-disclosure.core.ts:76`, and `apps/web/src/features/admin/verification/server/mutations/verify-attempt.ts:92,166` calling `apps/web/src/lib/notifications/recipient-role.ts:18`.
- A built database equals the declared schema — `NOT ENFORCED`. The migrator applies only the journal (`src/migrate.ts:34`); four `.sql` files are outside it, so a built database keeps `DEFAULT 'tenant_mk'` on the tenant column of **31** tables and lacks four declared indexes, among them `agent_commissions_tenant_subscription_type_uq` (DATA-14; `docs/engineering/DB-BASELINE.md:18,122-123`). Every CI database is built this way.
- Role is one of a fixed set — `NOT ENFORCED` (`src/schema/auth.ts:19`, no CHECK/enum; `A/modules/data-layer.md:115`).
- Claim amounts in a declared currency — `NOT ENFORCED` (`src/schema/claim-core.ts:53-54`; `A/modules/data-layer.md:125`).
- The document access log is append-only — `NOT ENFORCED`, comment only (`src/schema/documents.ts:78-105`; `A/modules/data-layer.md:133`).
- Migration order — `NOT ENFORCED` (DATA-02, `A/modules/data-layer.md:242`).
- (Full list: `A/modules/data-layer.md:109-140`, 21 rows.)

## Tenant boundary

Tenant context enters only as a `TenantAuthority` token or a resolved `TenantContext` (`src/tenant-context-resolution.ts` via `src/tenant.ts:27`), is set as `app.current_tenant_id` / `app.current_access_tenant_id` inside the transaction (`src/tenant.ts:37-41`), and is backed by row policies. Statement-level scoping is a convention, not a wrapper: 11.0% of call sites use the scoped helper, 68.7% a hand-written `eq(table.tenantId, …)`, 20.3% carry no tenant token and rely on policies alone (MEASURED, `A/modules/tenancy.md:88-92`). Bypass paths: R1 ruled out client-supplied tenant, session tampering, proxy, caches, share packs and file download; `dbAdmin` is UNVERIFIED for 13 of 19 using files, and raw SQL for all but 8 sites (`A/modules/tenancy.md:146-170`). **No confirmed leak** (`A/modules/tenancy.md:172`). The identity library does not use the tenant pool: it binds the privileged one (`apps/web/src/lib/auth/schema.ts:6`).

## Live and not live

Live: the tenant pool and `withTenantAuthority`; the journal migrator; the seed-target guard (`src/seed-target-guard.ts:190,211` — refuses a non-local target without `SEED_TARGET_CONFIRM=plan070:<target>`, and so admits any confirmed remote target; it knows production by one constant, `:10` — DATA-04). Not live: a second migration runner, 23 files / 2,303 lines, wired to nothing (DATA-11, `src/migrate.ts` is the live one); `packages/database/migrations/` (7 files) referenced by nothing; `supabase/migrations/` for storage, applied by no workflow (`docs/engineering/DB-BASELINE.md:122`). No repository-visible step migrates any deployed database (DATA-03).

## A new tenant table (added after the drill of R3)

Declare it in a schema file with its tenant column, its policy and `.enableRLS()`; the model is `src/schema/claim-information-requests.ts:35-102`: `using` compares the tenant column with the setting `app.current_tenant_id`, and `withCheck` also proves that the parent row is of the same tenant. `pnpm db:generate` then writes the migration with `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` (model: `drizzle/0093_s4_claim_information_requests.sql:19,26`), its snapshot and its journal entry (R-12). No journaled migration grants a privilege (searched: no line of the 104 files begins with `GRANT` or `ALTER DEFAULT PRIVILEGES`), so how the runtime role comes to its rights on a new table is a property of the environment, not of the migration (`docs/engineering/DB-BASELINE.md`, part 11), and is `UNVERIFIED` for the new environment. Two tests: `test/rls-coverage.test.ts`, in the `test:rls` list, fails when a table with a `tenant_id` column has row security off; the policy itself is proven by a test file of its own, which is added to that list (`package.json:42`; model `test/claim-information-requests.test.ts`), because a file that is only placed in `test/` runs nowhere.

## Tests to run

From `package.json:31-48`: `pnpm --filter @interdomestik/database test:unit`; `test:rls` (an explicit list of 24 test files at `:42`, the row-security and tenant-authority suite; the other 124 of the 148 files run in no workflow, TEST-03); `test:migration-runtime-role`; `type-check`; `seed:assert-e2e`. `test:rls` runs in CI (`.github/workflows/ci.yml:196`, `pnpm db:rls:test`, with `REQUIRE_RLS_INTEGRATION=1` and `REQUIRE_RLS_COVERAGE=1`) and `seed:assert-e2e` in the same job; no workflow step runs this package's `test:unit`, `test:migration-runtime-role` or `type-check` (the unit's search of the workflows, which agrees with TEST-03); `A/modules/data-layer.md:246` records that no workflow has a migration step (DATA-03).

## Do not reach into

`@interdomestik/database/db` for `dbAdmin` from a domain package or a feature — there is a test for it (`test/no-domain-db-admin-import.test.ts`, `package.json:42`). The `db` alias of the tenant client (`src/db.ts:254-255`) — it is kept only for backwards compatibility and is one of the three coexisting tenant-entry generations (TEN-05). The caller-built `{ tenantId }` form of `withTenantContext` (8 calls in 7 files, `A/modules/tenancy.md:95`).

## Open findings

DATA-02 to DATA-09, DATA-11, DATA-12 (`A/modules/data-layer.md:239-252`), DATA-13 and DATA-14 (`docs/engineering/DB-BASELINE.md:18,89`), TEN-01…TEN-05 (`A/modules/tenancy.md:215-221`), SEC-12 (S3 since R3) and SEC-13 (`docs/engineering/DB-BASELINE.md`, part 12). Work packages: WP-04 and WP-15 for the build path, the role settings and the seed guard (`docs/engineering/DB-BASELINE.md:210-220`); WP-17 for the rehearsal and storage.
