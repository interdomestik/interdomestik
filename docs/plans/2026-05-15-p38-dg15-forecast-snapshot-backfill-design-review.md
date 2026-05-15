# P38-DG15 Forecast Snapshot Backfill Design Review

Status: review_draft
Slice: `P38-DG15`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-15
Authority: review draft only. This document does not promote implementation until reviewer feedback is applied.
Recommended implementation slice: `P38-CRM17 Forecast Snapshot Backfill`

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice.

## Status / Predecessor Closeout

`P38-CRM18 Forecast Snapshot Observability` is complete through PR `#770`, merge commit
`a3712de4e0f99dd92999749e036ef6ae4fb770a7`, with closeout sync PR `#771`, merge commit
`4b8d4434b6f7e2c649fcf9e19c5d4f1550748808`. CRM18 made previous-UTC-day snapshot health visible on
the existing `/admin/crm` surface without adding run-ledger persistence, scheduler mutation,
alerting, schema changes, new routes, or branch-manager observability.

The reporting tranche now has:

- CRM05 reporting read-models and append-only snapshot persistence.
- CRM13 protected daily forecast snapshot scheduler.
- CRM14, CRM15, CRM16, and CRM20 reporting consumption across admin, staff, chart enhancement, and
  branch-manager surfaces.
- CRM18 admin-only snapshot health visibility that can reveal missing or stale snapshot dates.

The next operational gap is controlled historical repair: when CRM18 shows missing or stale snapshot
coverage for a tenant/date, operators need a bounded way to regenerate historical snapshot rows
without changing the daily scheduler, adding UI controls, or introducing durable run-ledger schema in
the first pass.

## Decision

Review exactly one bounded implementation candidate:

`P38-CRM17 Forecast Snapshot Backfill`

The recommended slice should add a tenant-scoped, manually invoked backfill API that reuses CRM13
snapshot derivation and CRM05 append-only snapshot persistence for a short historical UTC date range.
It should be protected by the existing cron bearer-secret boundary, return aggregate-only PII-safe
results, support dry-run mode, and leave operator UI/run-ledger/alerting for later gates.

This draft does not promote CRM17 yet. Promotion requires reviewer approval and a subsequent update
of this document to `Status: complete` with `Promoted implementation slice: P38-CRM17 Forecast
Snapshot Backfill`.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                 |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `P38-CRM17 Forecast Snapshot Backfill`             | Recommend for review. CRM18 can expose gaps; the next step is bounded historical repair. |
| 2    | `P38-CRM19 Forecast Snapshot Backfill Operator UX` | Defer. UX controls should follow a stable protected backfill contract.                   |
| 3    | `P38-CRM22 Forecast Snapshot Alerting`             | Defer. Alerting should follow a stable health/backfill/run-history contract.             |
| 4    | `P38-CRM21 Visual Regression Baseline`             | Defer. Useful, but less urgent than operational repair of snapshot gaps.                 |
| 5    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Independent from the forecast snapshot operations sequence.                       |
| 6    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires routing persistence first.                                               |
| 7    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader and production-data confidence.                        |
| 8    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                   |

## Implementation Scope For P38-CRM17

Allowed:

- Add `POST /api/cron/crm/forecast-snapshots/backfill` as a manually invoked operational API route.
- Reuse the existing `Authorization: Bearer $CRON_SECRET` cron authorization helper.
- Add a testable route/core split under `apps/web/src/app/api/cron/crm/forecast-snapshots/backfill`.
- Reuse CRM13 expected work-item discovery and CRM05/CRM13 snapshot derivation/persistence through
  existing app-side `domain-crm` boundaries.
- Generate append-only forecast snapshot rows for a tenant-scoped historical UTC date range.
- Support dry-run mode that performs discovery/derivation accounting without inserting snapshots.
- Return aggregate-only PII-safe JSON results.
- Add focused route/core/repository/PII/DB-access tests and tracker/program proof only after
  promotion.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names, route authority, auth/session layering, or tenant isolation architecture.
- Schema/migrations, RLS policies, snapshot table shape, or run-ledger tables.
- Existing daily scheduler route behavior, cron authorization semantics, Vercel cron config, or
  CRM13 default previous-UTC scheduler behavior.
- `/admin/crm`, `/agent/crm`, `/staff/crm`, branch-manager CRM UI, member UI, sidebars, or charting
  components.
- Operator UI, buttons, forms, dashboards, alerting integrations, Slack/email notifications,
  external observability dashboards, or log-scraping integrations.
- Routing persistence, routing admin UX, legacy deal cleanup, CRM04 nullability tightening, Stripe,
  README, AGENTS.md, or broad architecture docs.

## Route And Authorization Contract

CRM17 uses a new API route only:

`POST /api/cron/crm/forecast-snapshots/backfill`

This route is intentionally not a canonical product page route and does not require proxy edits. It
must not add a new admin page, sidebar item, staff/agent/member surface, or branch-manager control.

Authorization rules:

1. The route uses `authorizeCronRequest` with `process.env.CRON_SECRET`, matching the protected cron
   posture used by CRM13.
2. Missing, malformed, or incorrect authorization returns `401` before reading the request body or
   touching CRM repositories.
3. Backfill is tenant-scoped in the first slice. The request must include exactly one non-empty
   `tenantId`; all-tenant backfill is deferred.
4. The route must not use a user session, admin session, or branch-manager session to authorize the
   operation. Operator identity is not inferred in CRM17.
5. The route must not mutate Vercel cron configuration or make the backfill route scheduled.

Author rationale: using the existing cron bearer boundary avoids auth/session refactors and CSRF
surface area while keeping the first repair path manually invokable by trusted operators. Requiring a
tenant ID keeps blast radius bounded and forces all-tenant loops to remain explicit runbook work.

## Request Contract

CRM17 accepts a JSON body:

```ts
export interface CrmForecastSnapshotBackfillRequest {
  tenantId: string;
  fromDate: string;
  toDate: string;
  dryRun?: boolean;
  maxWorkItemsPerDate?: number;
}
```

Validation rules:

- `tenantId` is trimmed and must be non-empty.
- `fromDate` and `toDate` must be `YYYY-MM-DD` UTC dates.
- The date range is inclusive and processes dates ascending.
- `fromDate <= toDate`.
- `toDate` must be no later than the previous UTC date at route-core entry. Today and future dates
  are rejected.
- `fromDate` must be no earlier than
  `CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_LOOKBACK_DAYS` before the previous UTC date.
- Date count must be at most `CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS`.
- `maxWorkItemsPerDate`, when present, must be a positive integer no greater than
  `CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE`.
- Unknown request fields are ignored or rejected consistently by the implementation; the design
  recommendation is to reject unknown fields so operator typos fail closed.

Dry run rules:

- `dryRun: true` performs request validation, expected work-item discovery, and aggregate derivation
  accounting, but it must not call `insertPipelineSnapshots`.
- Dry-run responses use the same output shape as write responses with `snapshotsInserted: 0` and
  `status: 'dry_run'` for each date result that would otherwise run.
- Dry-run mode must still enforce all date, tenant, work-item cap, and PII rules.

## Backfill Derivation Contract

For each snapshot date `D`, CRM17 derives the same reporting window as CRM13:

- `snapshotDateEndExclusive = D + 1 day at 00:00:00.000Z`.
- `snapshotDateStartInclusive = snapshotDateEndExclusive - CRM_REPORTING_MAX_WINDOW_DAYS`.

For each date:

1. Discover expected work items through `crmForecastSnapshotWorkItemRepository.listWorkItems` with
   the request tenant ID, date-specific reporting window, and per-date cap.
2. For each work item, load weighted pipeline rows through the existing CRM05 reporting repository
   and filter by exact tenant, pipeline, branch including null, and ISO currency code.
3. Derive forecast snapshot rows through `deriveCrmWeightedPipeline` and `deriveCrmForecastSnapshot`
   using the same grouping semantics as CRM13.
4. In write mode, persist rows through `crmForecastSnapshotRepository.insertPipelineSnapshots`.
5. Continue processing later dates after a per-date partial failure unless the global duration cap is
   reached.

The implementation may extract shared scheduler/backfill helpers from CRM13 only when doing so keeps
the existing scheduler route behavior byte-for-byte equivalent at the contract level. Any helper
extraction must be covered by existing CRM13 tests plus focused CRM17 tests.

## Append-Only Semantics

CRM17 does not repair rows in place and does not delete old snapshots.

- Backfill writes append new snapshot versions using the existing `crm_pipeline_snapshots` version
  uniqueness contract.
- If a date already has snapshot rows, rerunning backfill may create a newer `snapshotVersion` for
  the same tenant/pipeline/branch/currency/date key.
- Existing CRM14/CRM18 latest-version readers remain the authority for which version is displayed.
- The response must state that snapshots are append-only and expose inserted/version-conflict counts.
- CRM17 must not add a unique idempotency index, mutate existing idempotency semantics, or attempt
  in-place deduplication without a later schema-reviewed gate.

## Exported Constants

CRM17 should export constants from the backfill core:

```ts
export const CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS = 7;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_LOOKBACK_DAYS = 366;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE = 250;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_TARGET_DURATION_MS = 60_000;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_SOURCE_RUN_PREFIX = 'crm-forecast-snapshot-backfill';
```

Tests should import these constants rather than duplicating literal thresholds.

## Output Shapes

CRM17 route-core output must expose aggregate-only, PII-safe projections:

```ts
export type CrmForecastSnapshotBackfillDateStatus =
  | 'completed'
  | 'dry_run'
  | 'partial'
  | 'failed'
  | 'deferred';

export interface CrmForecastSnapshotBackfillDateResult {
  failedWorkItems: number;
  snapshotDate: string;
  snapshotsInserted: number;
  status: CrmForecastSnapshotBackfillDateStatus;
  versionConflicts: number;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsSucceeded: number;
}

export interface CrmForecastSnapshotBackfillResult {
  completedAt: string;
  dateResults: CrmForecastSnapshotBackfillDateResult[];
  datesConsidered: number;
  datesDeferred: number;
  datesFailed: number;
  datesSucceeded: number;
  dryRun: boolean;
  failedWorkItems: number;
  fromDate: string;
  snapshotsInserted: number;
  sourceRunId: string;
  startedAt: string;
  tenantId: string;
  toDate: string;
  versionConflicts: number;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsSucceeded: number;
}
```

`sourceRunId` is generated by the core, not supplied by the request:

```txt
crm-forecast-snapshot-backfill:<tenantId>:<fromDate>:<toDate>:<startedAt>
```

The route response is:

```ts
type CrmForecastSnapshotBackfillResponse =
  | { success: true; result: CrmForecastSnapshotBackfillResult }
  | { success: false; error: string; code: CrmForecastSnapshotBackfillErrorCode };
```

Error codes should be stable literals such as `unauthorized`, `invalid_json`, `invalid_range`,
`range_too_large`, `date_out_of_bounds`, `invalid_tenant`, and `internal_error`.

## HTTP Status Semantics

- `200`: request was authorized and core execution completed, including dry-run and partial results.
- `400`: invalid JSON or validation failure.
- `401`: missing/invalid cron bearer authorization.
- `500`: unexpected exception before a structured result can be produced, or every considered date
  failed due to unexpected processing errors.

Partial backfill results use HTTP `200` with `success: true` and per-date `partial` or `failed`
statuses unless the entire run fails. The response body is the operational contract; callers should
not infer per-date success from HTTP status alone.

## PII And Logging Rules

- Responses and logs must not include lead, contact, member, staff, agent, deal, email, phone, full
  name, notes, description, subject, or raw activity fields.
- Safe response/log fields are limited to tenant ID, pipeline ID, branch ID or no-branch sentinel,
  ISO currency code, snapshot date, source run ID, aggregate counts, status, and error class.
- Work-item failure logs may include tenant ID, pipeline ID, branch ID/no-branch sentinel, currency
  code, snapshot date, and sanitized error message only.
- A colocated PII regression test must inspect response keys and representative logs.
- The route must not log request bodies wholesale.

## DB Access And Tenancy Rules

- Expected work-item discovery must pass `tenantId` and retain the same-statement tenant predicate
  added during CRM18.
- Weighted-pipeline reads must use CRM05 reporting repository authorization with a system/admin CRM
  actor scoped to the requested tenant.
- Snapshot writes must carry the same tenant ID from the expected work item into every derived row.
- No all-tenant work-item discovery is allowed in CRM17.
- No in-memory filtering of all-tenant rows is allowed as a substitute for SQL tenant predicates.

## Acceptance Criteria

- The protected backfill route accepts a tenant-scoped historical UTC date range and rejects
  unauthorized, future/today, out-of-order, over-large, too-old, tenantless, and malformed requests.
- Dry-run mode returns the same aggregate shape without inserting snapshots.
- Write mode appends forecast snapshot rows through the existing snapshot repository and preserves
  existing append-only version semantics.
- Backfill uses CRM13/CRM05 reporting derivation semantics for each date and tenant-scoped work item.
- The existing daily scheduler route behavior and Vercel cron config are unchanged.
- Output and logs remain aggregate-only and PII-safe.
- CRM18 observability can see backfilled rows through the existing latest-version snapshot readers
  without CRM18 UI changes.
- No schema, migration, RLS, proxy, canonical-route, auth/tenancy-architecture, UI, sidebar,
  charting, alerting, run-ledger, or operator-control changes are included.

## Coverage Discipline

Focused implementation proof should include:

- Route tests for `401`, invalid JSON, invalid date formats, today/future dates, range too large,
  too-old dates, missing tenant ID, dry-run success, write success, partial success, and all-date
  failure mapping.
- Core tests for inclusive date expansion, ascending date processing, previous-UTC boundary freezing,
  per-date reporting window calculation, per-date work-item caps, global duration deferral, source
  run ID generation, dry-run no-write behavior, append-only write behavior, and aggregate totals.
- Repository/domain-boundary tests proving tenant-scoped expected work-item discovery and exact
  tenant/pipeline/branch/currency filtering.
- Scheduler non-regression tests proving existing `GET /api/cron/crm/forecast-snapshots` date
  validation and previous-UTC behavior remain unchanged.
- PII regression tests for response keys and log payloads.
- DB-access guard proof for any new direct DB access.
- No Playwright/browser validation is required unless implementation adds UI, which CRM17 should not
  do.

## Risks And Open Questions

- **Append-only duplicate versions.** Backfill reruns intentionally create newer versions rather than
  rewriting history. This is compatible with current readers but can grow snapshot rows. The first
  slice mitigates with tenant/date caps and leaves dedupe/retention policy to a later schema-reviewed
  gate.
- **All-tenant outage recovery.** Tenant-scoped requests require operators to loop tenants for a
  fleet-wide outage. This is deliberate first-slice blast-radius control. Reviewers may choose to
  promote all-tenant backfill later after run-ledger or operator UX work.
- **No durable run history.** CRM17 returns immediate aggregate results but does not persist run
  records. CRM18 can observe resulting snapshot rows, but it cannot display historical backfill
  attempts as durable runs until a later run-ledger gate.
- **Manual route misuse.** The route is powerful. The contract uses existing bearer-secret auth,
  range caps, tenant requirement, dry-run support, and aggregate logging to limit accidental damage.
- **Long-running work.** Serverless/runtime limits may interrupt large backfills. The first slice
  caps dates and work items, exposes deferral counts, and expects operators to retry with smaller
  ranges.

## Review Questions

1. Should CRM17 use a protected API route or a checked-in script?
   Author recommendation: protected API route. It reuses deployed app-side repositories and cron
   auth, works in the same runtime as the scheduler, and avoids local DB credential/runbook drift.
2. Should the first backfill slice support all tenants?
   Author recommendation: no. Require `tenantId` for CRM17 and defer all-tenant fleet backfill to a
   later run-ledger/operator UX gate.
3. Should backfill be dry-run-only in the first implementation?
   Author recommendation: no. Include both dry-run and write mode. CRM18 already exposes missing
   coverage; operators need a bounded repair path, not just another diagnostic.
4. Should CRM17 persist a durable backfill run ledger?
   Author recommendation: no. It requires schema/RLS review and should be promoted separately if
   needed after the first protected repair path proves useful.
5. Should reruns overwrite existing snapshot rows?
   Author recommendation: no. Preserve append-only snapshot semantics and let latest-version readers
   select the newest row.

## Dependency / Sequencing

CRM17 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM13 Forecast Snapshot Scheduler`.
- `P38-CRM18 Forecast Snapshot Observability`.

CRM17 should land before:

- `P38-CRM19 Forecast Snapshot Backfill Operator UX`.
- `P38-CRM22 Forecast Snapshot Alerting`.
- Any durable run-ledger or fleet observability work.

CRM17 is independent of CRM reporting charting, branch-manager reporting UI, routing persistence,
routing admin UX, legacy deal column retirement, and CRM04 nullability tightening.

## Non-Goals

- UI, sidebar, dashboard, page marker, or chart changes.
- All-tenant fleet backfill in one request.
- Durable run-ledger schema, migrations, RLS, or alerting.
- Scheduler route behavior changes, Vercel cron changes, or daily snapshot cadence changes.
- Snapshot overwrite/delete/dedupe/retention policy.
- Branch-manager/staff/agent/member CRM surfaces.
- Proxy edits, canonical route changes, auth/session layering changes, tenant isolation architecture
  changes, Stripe, README, AGENTS.md, or broad architecture docs.

## Verification Plan

Draft-review verification for this document requires:

- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `git diff --check`
- `interdomestik_qa.scope_audit` with docs-only allowed paths
- `pnpm verify-slice -- --static`

Future implementation PR verification should include:

- Focused route/core tests for the new backfill API.
- Focused scheduler non-regression tests.
- Focused `domain-crm` / app-side repository tests for tenant scoping and exact work-item matching.
- PII regression tests for response/log shape.
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web lint`
- `pnpm check:db-access`
- `pnpm i18n:check` and `pnpm i18n:purity:check` only if localized copy is added; CRM17 should not
  need new UI copy.
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `git diff --check`
- `interdomestik_qa.scope_audit` with allowed implementation paths only
- `pnpm verify-slice -- --static`
- Before PR merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`

## Promotion Boundary

This review draft is docs-only and does not authorize implementation. If reviewer feedback is
accepted, the promotion PR should:

- Change `Status: review_draft` to `Status: complete`.
- Add `Promoted implementation slice: P38-CRM17 Forecast Snapshot Backfill`.
- Update `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.
- Include a sign-off table that records CRM05, CRM13, CRM18, CRM17, CRM19, CRM22, CRM21, CRM08,
  CRM09, CRM10, and CRM11 statuses.
- Remain docs-only; implementation must land in a separate PR after promotion.
