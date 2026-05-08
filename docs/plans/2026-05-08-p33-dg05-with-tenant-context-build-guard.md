---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
date: 2026-05-08
last_reviewed: 2026-05-08
tracker_path: docs/plans/current-tracker.md
program_path: docs/plans/current-program.md
---

# P33-DG05 withTenantContext Build Guard Design Review

> Status: Archived design gate. DG05 is complete. P33-SEC04 promoted.

## Classification

This is a promotion/design-gate slice. It drafts the implementation contract for a
bounded tenancy build guard and does not change product runtime code.

## Decision

Promote exactly one bounded implementation slice:

`P33-SEC04 withTenantContext Build Guard Baseline`

The implementation must extend the existing direct DB access guard so new sensitive direct
database callsites are not only baseline-counted, but also classified by tenant-context
posture. The first implementation should be a guard and reporting baseline, not a mass
rewrite of existing database access.

`P33-SEC03 First-Party Script Nonce Coverage` remains pending in the CSP lane. PR `#680`
improved first-party CSP report classification and documented the framework/static nonce
blocker, but it did not complete full nonce coverage or unblock CSP Phase 1 enforcement.
DG05 runs in parallel because the tenancy guard touches separate files and a separate
production-maturity risk category.

## Evidence Reviewed

| Evidence                              | Finding                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/src/tenant.ts`     | `withTenantContext` asserts a non-empty tenant id, waits for the RLS connection-role assertion, runs through `dbRls.transaction`, enables `row_security`, sets `app.current_tenant_id`, optionally sets `app.user_role`, and exposes `withTenantDb` as an alias.                                                                                            |
| `scripts/check-db-access-guard.mjs`   | Existing guard scans `apps/web/src` and `packages`, finds direct `db.*` calls for `query`, `select`, `insert`, `update`, `delete`, `execute`, and `transaction`, and blocks new entries beyond `scripts/ci/db-access-baseline.json`. It does not classify `withTenantContext`, `withTenantDb`, `dbRls`, `dbAdmin`, tenant predicates, or system exemptions. |
| `scripts/ci/db-access-guard.test.mjs` | Current tests prove the guard is wired into `check:all` and `pr:verify`, catches new direct DB calls, multiline chains, transaction aliases, aliased imports, local aliases, and ignores type-only references.                                                                                                                                              |
| `scripts/ci/db-access-baseline.json`  | Current baseline has `621` direct entries as of commit `2e7197d32bca43bc9915665811eee7d59f0f4c5a` on 2026-05-08: `311` app-layer, `303` domain-wrapper, `5` server-action, and `2` high-risk-route.                                                                                                                                                         |
| `package.json`                        | `check:db-access` is wired into `check:all` and `pr:verify`, so any guard extension becomes part of the normal PR safety path.                                                                                                                                                                                                                              |
| P33 roadmap gates                     | `withTenantContext` build-guard design has been deferred behind SEC01 and CSP Phase 0, and DG03/DG04 explicitly keep it parallelizable after the CSP hypothesis gate.                                                                                                                                                                                       |
| `pnpm check:db-access`                | Current runtime is approximately `0.69s` on this machine at commit `2e7197d32bca43bc9915665811eee7d59f0f4c5a`. SEC04 must capture before/after numbers in the PR body and keep the upgraded guard under `2x` this baseline unless a reviewer explicitly accepts the regression.                                                                             |
| `wc -l` size check                    | Current guard is `492` lines, current baseline is `4357` lines, and current test file is `181` lines. The v2 enriched baseline should stay readable as one file unless it grows beyond roughly `10000` lines, in which case SEC04 may propose per-risk shards rather than silently shipping an unwieldy baseline.                                           |

## Problem Statement

The repo already has runtime tenant-context primitives and a direct DB access guard, but the
guard currently answers only one question: "did this PR add a new direct `db.*` call outside
approved database internals?"

It does not answer the stronger production-tenancy question: "is this sensitive database
access known to run inside `withTenantContext`/`withTenantDb`, intentionally tenant-filtered,
or explicitly system/admin scoped?"

That gap matters because the baseline is large enough that a reviewer cannot audit posture
manually on every PR. The next step should make tenant-context posture visible and prevent
new unclassified sensitive DB access from entering the codebase.

## P33-SEC04 Contract

`P33-SEC04 withTenantContext Build Guard Baseline` is an implementation slice with this
contract:

1. Extend the DB access guard reporting model with tenant-posture classification.
2. Keep the existing direct-access baseline behavior intact: existing baseline entries must
   keep passing unless the implementation intentionally upgrades the baseline format with a
   reviewed diff.
3. Block newly added unclassified sensitive direct DB access outside approved database
   internals.
4. Recognize direct DB calls inside `withTenantContext(...)` or `withTenantDb(...)`
   callbacks when the callback uses the provided transaction alias.
5. Recognize direct DB calls that are already transaction aliases created by plain
   `db.transaction(...)` as direct access, not tenant-contexted access.
6. Classify explicit privileged/system posture separately from tenant-context posture, with
   narrow rules and tests for each exemption.
7. Emit a machine-readable report with counts by risk and tenant posture.
8. Produce `docs/security/db-access-posture-baseline.md` with a markdown count table by
   posture, risk, and file-prefix. The report must contain counts only, not per-line
   listings.
9. Produce `docs/dev/db-access-guard.md` as the contributor playbook for the upgraded guard.
10. Preserve `check:db-access`, `check:all`, and `pr:verify` wiring.

SEC04 is time-boxed to ship within two weeks of DG05 promotion. If the implementation slips
past that window, DG05 must be re-reviewed before the guard branch proceeds.

## Parser Boundary

SEC04 should use TypeScript's compiler API for callback boundary discovery only:

- find `withTenantContext(arg0, callback)` and `withTenantDb(arg0, callback)` calls;
- identify the callback parameter bound to the tenant transaction, including `async tx =>`,
  `async (tx) => { ... }`, renamed parameters such as `async tenantTx =>`, and block-body
  callbacks;
- include nested `tx.transaction(...)` use inside an already discovered tenant-context
  callback as tenant-contexted when the nested transaction is reached from the tenant
  transaction alias.

After the callback boundary and transaction parameter are known, the implementation may use
the existing source-normalization or substring matching approach to find
`<param>.select(...)`, `<param>.insert(...)`, `<param>.update(...)`, `<param>.delete(...)`,
`<param>.execute(...)`, `<param>.query...`, and nested `<param>.transaction(...)` calls
inside the callback body.

This is not a full type-aware AST migration. Anything outside this bounded AST scope, such
as `const myTx = tx` re-aliasing inside a callback, deliberately classifies as
`unclassified` until a future slice adds and tests that pattern.

## Approved Database Internals

The current guard treats `packages/database/` as the approved wrapper path. SEC04 should not
silently widen that posture. For the v2 posture model, approved database internals are
limited to the existing database package implementation surfaces:

- `packages/database/src/db.ts`
- `packages/database/src/tenant.ts`
- `packages/database/src/tenant-security.ts`
- `packages/database/src/server.ts`
- `packages/database/src/migrate.ts`
- `packages/database/src/seed.ts`
- `packages/database/src/seed-*.ts`
- `packages/database/src/seed-*/**`
- `packages/database/src/scripts/**`
- `packages/database/src/schema.ts`
- `packages/database/src/schema/**`

New allowlist additions require an explicit baseline diff and reviewer sign-off. A new file
under `packages/database/src/` is not automatically allowed unless it fits one of the
listed patterns or the baseline diff explains why it is a database internal.

## Tenant Posture Taxonomy

SEC04 should use a small, auditable taxonomy:

| Posture            | Rule                                                                                                                       | Merge posture                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `tenant-context`   | Direct access happens through the transaction alias supplied by `withTenantContext` or `withTenantDb`.                     | Preferred for tenant-scoped writes and high-risk reads.                                |
| `tenant-predicate` | Direct access uses an explicit tenant predicate in the same statement as the DB call.                                      | Acceptable for already-baselined reads; not enough by itself for new sensitive writes. |
| `admin-privileged` | Uses intentionally privileged admin/system database access such as `dbAdmin`, or lives inside approved database internals. | Must be explicit and narrowly exempted.                                                |
| `system-exempt`    | Cron, webhook, migration, seed, or maintenance code with documented system scope or server-derived tenant iteration.       | Must be explicit and narrowly exempted.                                                |
| `unclassified`     | Direct DB access without recognized tenant context, tenant predicate, or privileged/system exemption.                      | Existing entries may be carried by baseline; new entries must fail.                    |

The taxonomy is intentionally posture-oriented, not a guarantee that every query is
semantically correct. It gives reviewers a build-time receipt and prevents the baseline from
silently growing in the riskiest category.

### Tenant Predicate Recognition Rule

`tenant-predicate` is recognized only when the tenant condition appears in the same
statement as the DB call and the tenant value is a non-literal identifier.

Accepted fixture shape:

```ts
return db
  .select()
  .from(claims)
  .where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)));
```

Rejected fixture shape:

```ts
return db
  .select()
  .from(claims)
  .where(and(eq(claims.tenantId, 'tenant_ks'), eq(claims.id, claimId)));
```

Accepted helper fixture shape:

```ts
return db.query.claims.findMany({
  where: (table, { eq }) => withTenant(tenantId, table.tenantId, eq(table.status, 'open')),
});
```

Rejected split-statement fixture shape:

```ts
const scope = eq(claims.tenantId, tenantId);
return db.select().from(claims).where(scope);
```

The split-statement case may be semantically safe, but SEC04 should classify it as
`unclassified` until a later guard slice adds and tests data-flow recognition.

### System Exemption Directive

`system-exempt` requires a directive immediately above the DB call:

```ts
// db-access-guard: system-exempt -- reason: cron iterates tenants from sealed list
await db.update(claims).set({ status: 'archived' });
```

The reason text is extracted into the report. Path-based auto-exemption for cron, webhook,
or script files is rejected because it hides rationale and silently extends exemptions when a
new file lands.

### Canonical Reason Strings

SEC04 must emit exactly these stable `tenantPostureReason` strings:

- `tenant-context: callback-tx-alias`
- `tenant-context: callback-tx-block`
- `tenant-predicate: in-where-clause`
- `admin-privileged: dbAdmin`
- `system-exempt: directive`
- `unclassified: no-recognized-context`

The system-exempt directive's free-form reason must be emitted in a separate report field,
not substituted into `tenantPostureReason`.

### Drizzle Scope Boundary

SEC04 is narrowed to Drizzle access and transaction aliases: `db`, `dbRls`, `dbAdmin`, plain
`db.transaction(...)`, and `withTenantContext`/`withTenantDb` transaction callbacks.

Supabase service-role usage through `createAdminClient()` is a separate storage/admin-bypass
maturity slice. SEC04 must not automatically classify `createAdminClient().storage.*` or
`createAdminClient().from(...)` as Drizzle `admin-privileged` access.

## V2 Baseline Shape

SEC04 should pin the baseline format before merge:

```json
{
  "version": 2,
  "policy": "see docs/dev/db-access-guard.md",
  "generatedAt": "2026-05-08T00:00:00.000Z",
  "counts": {
    "byRisk": {
      "app-layer": 311,
      "domain-wrapper": 303,
      "high-risk-route": 2,
      "server-action": 5
    },
    "byTenantPosture": {
      "tenant-context": 0,
      "tenant-predicate": 0,
      "admin-privileged": 0,
      "system-exempt": 0,
      "unclassified": 621
    }
  },
  "entries": [
    {
      "file": "apps/web/src/example.ts",
      "line": 42,
      "callee": "db.select",
      "method": "select",
      "risk": "app-layer",
      "source": "return db.select().from(claims)",
      "tenantPosture": "tenant-context",
      "tenantPostureReason": "tenant-context: callback-tx-alias"
    }
  ]
}
```

The counts above are illustrative shape values, not the expected final v2 posture result.
SEC04 must regenerate them from the upgraded classifier.

## Expected Classification Bar

A quick DG05 snippet-only heuristic over the v1 baseline saw `571` entries as
`unclassified` and `50` as system-exempt candidates. That result is not acceptable as the
final SEC04 outcome because the v1 baseline does not include callback or same-statement
context.

SEC04 must run the real v2 classifier before merge and target an authoritative
`unclassified` count of `<= 80` across the existing baseline. If the count is higher, SEC04
must either expand the recognized tested patterns within the approved parser boundary or
pause and reopen DG05 for scope review. The implementation must not merge a v2 baseline that
simply labels most existing entries `unclassified`.

## Implementation Shape

Preferred implementation:

- Evolve `scripts/check-db-access-guard.mjs` rather than creating a second parallel guard.
- Add focused parser helpers for:
  - imported and assigned aliases for `withTenantContext` and `withTenantDb`;
  - callback transaction aliases created by those functions;
  - direct access through those transaction aliases;
  - explicit same-statement `withTenant(...)` or tenant-id predicate usage;
  - narrow directive-based system exemptions.
- Upgrade the report to include:
  - `tenantPosture`;
  - `tenantPostureReason`;
  - counts by `risk`;
  - counts by `tenantPosture`;
  - new and removed entry diffs preserving the current failure behavior.
- If the baseline schema changes, move from version `1` to version `2` and include a
  reviewer-readable policy string that explains the posture categories.
- Keep fixture tests in `scripts/ci/db-access-guard.test.mjs` as the primary proof surface.

Use the bounded AST callback-discovery approach defined above. Do not implement a full
type-aware AST migration in SEC04. The existing guard is a small Node script; SEC04 should
preserve that maintainability profile.

If the enriched v2 baseline grows beyond roughly `10000` lines, SEC04 may propose a
per-risk shard fallback such as `db-access-baseline-app-layer.json` and
`db-access-baseline-domain-wrapper.json`, but only if the single-file approach hits a real
maintainability ceiling.

## Required Test Cases For SEC04

SEC04 must add or update focused tests that prove:

- Existing direct DB guard behavior still fails on a new unbaselined `db.select()`.
- A `withTenantContext({ tenantId }, async tx => tx.select(...))` call is classified as
  `tenant-context`.
- `withTenantDb({ tenantId }, async tenantTx => tenantTx.update(...))` is classified as
  `tenant-context`.
- A plain `db.transaction(async tx => tx.update(...))` remains direct access and is not
  misclassified as `tenant-context`.
- A new write using only a tenant predicate but no tenant context fails unless explicitly
  reviewed into the baseline.
- A read with a clear `withTenant(...)` predicate is classified as `tenant-predicate`.
- A narrow privileged/system exemption is classified separately and cannot accidentally
  exempt normal app-layer code.
- The report JSON includes posture counts and per-finding posture fields.
- `check:db-access` remains wired into `check:all` and `pr:verify`.
- A correctness fixture suite covers 10-20 real files from the codebase spanning app route,
  server action, domain wrapper, cron, webhook, seed, migration, privileged Drizzle access,
  tenant-predicate read, and unclassified direct access patterns. The expected posture for
  each fixture must be pinned.

## Acceptance Criteria

SEC04A is accepted as the guard/reporting baseline when:

1. `pnpm check:db-access` passes on the current repo and emits posture counts.
2. New unclassified sensitive direct DB access fails in fixture tests.
3. Tenant-contexted access through `withTenantContext` and `withTenantDb` is recognized in
   fixture tests.
4. Plain `db.transaction` access is not confused with tenant-contexted access.
5. The baseline diff, if any, is versioned, reviewable, and limited to guard metadata or
   intentional posture classification.
6. No runtime product behavior changes are introduced.
7. No `apps/web/src/proxy.ts`, canonical route, auth architecture, tenancy architecture,
   schema, migration, Stripe, README, AGENTS, or architecture-doc files are edited.
8. `docs/security/db-access-posture-baseline.md` exists and reports counts by posture, risk,
   and file-prefix.
9. `docs/dev/db-access-guard.md` exists and explains how contributors fix guard failures.
10. The authoritative v2 classifier reports the residual unclassified count in the posture
    baseline. A count above `<= 80` is acceptable only for SEC04A and must promote a
    follow-up burn-down slice instead of closing the full SEC04 maturity risk.
11. `pnpm check:db-access` stays within `2x` the measured pre-SEC04 runtime unless the PR
    records an explicit reviewer-approved exception.

## DG05 Amendment: SEC04A/SEC04B Split

During SEC04 implementation, the authoritative v2 classifier produced useful guard and
reporting output but returned `262` `unclassified` baseline entries. That is above the
original `<= 80` acceptance bar. DG05 is therefore amended to split the work:

- `P33-SEC04A DB Access Posture Baseline`: accepted as the mergeable guard/reporting
  baseline. It may land the v2 baseline schema, posture classifier, non-regression guard,
  contributor playbook, and posture report while explicitly carrying the `262`
  `unclassified` residual.
- `P33-SEC04B DB Access Posture Burn-Down`: required follow-up implementation slice. It
  must reduce existing `unclassified` entries to `<= 80` or return to design review with
  evidence that the remaining entries need a different migration strategy.

SEC04A must not be used to claim full security/tenancy guard closure. Production-maturity
closure for this category remains blocked until SEC04B lands or the `<= 80` bar is replaced
by an explicit risk acceptance.

## Verification Plan For SEC04

- `node --test scripts/ci/db-access-guard.test.mjs`
- `pnpm check:db-access`
- `git diff --check`
- `pnpm verify-slice -- --static`
- Mandatory implementation reviewer pool:
  - security/auth/tenancy reviewer;
  - maintainability/code-quality reviewer;
  - test/gate reviewer;
  - performance/scalability reviewer if the script walks more context per file.
  - release-gate reviewer to dry-run the upgraded classifier against main's baseline and
    confirm the upgraded `check:db-access` has zero false-positive failures before merge.
- Diff-scoped Codex Security scan after reviewer fixes.
- `pnpm verify-slice -- --required-gates`

Browser or Playwright validation is not required unless the implementation unexpectedly
touches user-facing web behavior.

## Rollback And Mitigation

Rollback is straightforward: revert the guard and baseline/report-format changes. Because
SEC04 must not change runtime code, schema, routes, auth, or tenant-session behavior, rollback
does not require data migration or feature flag cleanup.

If SEC04 produces too many false positives during implementation, the mitigation is to keep
the posture report informational for existing baseline entries while failing only new
`unclassified` entries. Do not broaden exemptions to make the guard quiet.

## Non-Goals

- No product runtime behavior changes in DG05.
- No implementation in DG05.
- No mass migration of the existing `621` baseline entries.
- No blanket requirement that every existing read moves to `withTenantContext` in one PR.
- No schema migrations, RLS policy changes, or database role changes.
- No changes to `apps/web/src/proxy.ts`.
- No canonical route changes.
- No auth, tenancy, routing, or domain architecture refactors.
- No Stripe work.
- No README, AGENTS, or architecture-doc changes.
- No CSP Phase 1 enforcement or CSP nonce implementation changes.
- No new direct DB callsites added.
- No baseline entries removed without an explicit posture upgrade.
- No removal of `check:db-access` from `pr:verify` or `check:all`.

## Rejected Alternatives

| Alternative                                                             | Decision | Rationale                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mass-convert all direct DB calls to `withTenantContext`                 | Rejected | The baseline has `621` entries across app and domain surfaces, and a single reviewer cannot meaningfully audit a 621-callsite diff. SEC04 produces the posture report so migration becomes prioritizable rather than monolithic. |
| Create a second unrelated tenancy scanner                               | Rejected | The existing `check:db-access` guard is already wired into PR verification; extending it keeps one enforcement path.                                                                                                             |
| Treat `withTenant(...)` predicates as equivalent to `withTenantContext` | Rejected | Predicates help query scoping, but they do not prove RLS tenant GUC posture, transaction scoping, or local role setup.                                                                                                           |
| Block every existing unclassified baseline entry immediately            | Rejected | That would turn the slice into a repo-wide migration. SEC04 should stop new risk first and make existing posture visible.                                                                                                        |
| Promote CSP Phase 1 enforcement instead                                 | Rejected | CSP Phase 1 remains blocked by first-party framework/static nonce coverage and the observation promotion bar.                                                                                                                    |
| Resume CRM product work now                                             | Deferred | The user asked to finish the security/tenancy guard first; CRM should resume after this guard lane is closed or explicitly paused.                                                                                               |

## SEC04 PR Body Guards

The SEC04 PR body must explicitly state:

- no new direct DB callsites were added;
- no baseline entries were removed without an explicit posture upgrade;
- no runtime product code changed;
- no schema, migration, or database role changed;
- `check:db-access` remains wired into `pr:verify` and `check:all`;
- `apps/web/src/proxy.ts`, canonical routes, auth, tenancy architecture, schema, and Stripe
  remain untouched;
- CSP/SEC03 work is not folded in;
- the expected v1-to-v2 baseline schema bump is intentional and reviewed.

## Sequencing

SEC04 is safe to run in parallel with SEC03. SEC04 is scoped to `scripts/`, `scripts/ci/`,
`docs/dev/`, and `docs/security/`. SEC03 is scoped to CSP nonce/report helpers,
`proxy-logic`, root-layout nonce wiring, analytics nonce smoke, and security-header/browser
specs. The file sets are disjoint.

## Phase C Constraints

- `apps/web/src/proxy.ts` remains untouched.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- Existing `*-page-ready` clarity markers remain untouched.
- No auth, tenancy, routing, or domain architecture refactor is authorized.
- Stripe remains unused.

## DG05 Verification Plan

For this design-gate branch:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`
- `interdomestik_qa.scope_audit` with `docs/plans/` allowed and runtime/proxy/auth/schema
  paths forbidden

The tracker entry must record the expected baseline schema bump from v1 to v2 so automated
reviewers do not treat the enriched baseline shape as an accidental regression.
