# P38-DG09 Forecast Snapshot Scheduler Design Review

Status: complete
Slice: `P38-DG09`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-14
Authority: this gate opens `P38-CRM13 Forecast Snapshot Scheduler` only.
Promoted implementation slice: `P38-CRM13 Forecast Snapshot Scheduler`

## Status / Predecessor Closeout

`P38-CRM12 Reporting Dashboard UI` is complete through PR `#757`, merge commit
`3a220ea88eb0c2b765b56d3d926edd21952b3def`.

CRM12 added:

- Three chart-free `/agent/crm` reporting widgets: weighted pipeline by currency, source breakdown,
  and win rate by source.
- CRM05 reporting repository/domain read-model consumption from the existing agent CRM surface.
- Widget markers plus preservation of the contractual `agent-crm-page-ready` marker.
- PII-safe aggregate-only output, ISO-code currency display without conversion, and fail-closed
  reporting-denial behavior.
- Remote SonarCloud, Copilot/pr-finalizer, Pilot Gate, unit, E2E, audit, and security proof.

The tracker/program closeout for CRM12 was recorded after merge through PR `#758`, merge commit
`d2cf5e8264d8536795860d465b90b1a39099d543`, with Notion sync under
`PR 757 P38 CRM12 Reporting Dashboard UI`.

`P38-DG08` deliberately deferred `P38-CRM13 Forecast Snapshot Scheduler` until after dashboard
consumption existed. That prerequisite is now satisfied.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM13 Forecast Snapshot Scheduler`

CRM05 already provides deterministic forecast-snapshot derivation and append-only snapshot
persistence. CRM12 provides the first dashboard consumer. The next useful slice is the smallest
automation layer that can generate daily snapshot rows through that existing CRM05 boundary without
inventing a new reporting model, changing dashboard UI, or widening cron architecture.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                                   |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM13 Forecast Snapshot Scheduler`            | Promote now. CRM05 provides snapshot persistence and CRM12 provides a visible reporting consumer.          |
| 2    | `P38-CRM14 Admin Reporting Dashboard UI`           | Defer. Admin aggregate widgets should consume scheduled snapshot history after the generation path exists. |
| 3    | `P38-CRM15 Staff Reporting Dashboard UI`           | Defer. Staff/branch reporting should reuse the scheduler and admin reporting patterns.                     |
| 4    | `P38-CRM16 Reporting Charting Foundation`          | Defer. Charting should follow stable generated snapshot data and a bundle-size gate.                       |
| 5    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Still valid, but independent from the reporting/snapshot sequence currently in flight.              |
| 6    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                                |
| 7    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                                     |

## Implementation Scope For P38-CRM13

Allowed:

- A protected cron route under the existing `apps/web/src/app/api/cron/**` surface.
- A thin route handler using the existing `authorizeCronRequest` contract:
  `Authorization: Bearer $CRON_SECRET`.
- A testable scheduler core module under the web app that composes CRM05 reporting repositories,
  `deriveCrmWeightedPipeline`, `deriveCrmForecastSnapshot`, and
  `CrmForecastSnapshotRepository.insertPipelineSnapshots`.
- Minimal app-side repository helpers needed to enumerate active tenant/pipeline/branch/currency
  snapshot work items.
- Focused unit tests for route authorization, date selection, scheduler composition, no-op behavior,
  append-only insert behavior, version-conflict handling, and partial-failure accounting.
- Plan/tracker updates for the promoted slice and verification evidence.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- `/agent/crm`, `/admin/crm`, `/staff/crm`, or member UI.
- Charting-library dependencies, visual-regression baselines, or bundle-size configuration.
- New CRM schema/migrations, snapshot table shape, run-ledger tables, RLS policies, or backfills.
- Routing persistence, routing admin UX, legacy deal column retirement, CRM04 nullability
  tightening, Stripe, README, AGENTS.md, or broad architecture docs.

## Scheduler Contract

- Route path: `GET /api/cron/crm/forecast-snapshots`.
- Method rationale: `GET` matches the existing cron helper/route convention; snapshot writes remain
  append-only through CRM05's version contract. Request bodies are ignored.
- Authorization: fail closed with `401` unless `Authorization` exactly equals
  `Bearer ${CRON_SECRET}` via the existing cron auth helper.
- Rate limiting: use the existing cron route rate-limit posture before doing any DB work.
- Schedule target: daily run at `05:15 UTC`; first implementation may document the cron path without
  adding platform-specific deployment config if no repo-level scheduler config exists.
- Deployment wiring: if a checked-in platform scheduler config such as `vercel.json` exists at PR
  time, CRM13 must add the cron entry in that config; otherwise the route ships dark and deployment
  scheduling remains an operator step.
- Function budget: target p95 invocation duration is `< 60s`. Each work item has a soft timeout; if
  it expires, that item increments `failedWorkItems` and the run continues until the overall budget
  requires early exit.
- Platform timeout posture: partial commits are acceptable because snapshots are append-only and
  versioned. A platform kill may leave a partial run; the next authorized run appends new versions.
- Default snapshot date: previous UTC date relative to the route invocation time.
- Manual date override: allowed only for authorized cron requests through `?date=YYYY-MM-DD`, and
  only for the previous UTC date. Historical date backfill is deferred to `P38-CRM17`.
- Snapshot date freezing: the snapshot date is computed once at scheduler-core entry and reused for
  every work item in the run, even if the invocation crosses midnight UTC.
- Snapshot window: the core uses CRM05's live weighted-pipeline read model for the selected
  `snapshotDate`, bounded to CRM05's existing `CRM_REPORTING_MAX_WINDOW_DAYS` window ending at
  `snapshotDate 23:59:59.999 UTC`.
- `sourceRunId`: one caller-generated correlation ID shared across all rows emitted by one logical
  generation pass. The default format is `crm-forecast-snapshot:<snapshotDate>:<runStartedAtIso>`.
- `idempotencyKey`: populated on emitted snapshot rows as
  `crm-forecast-snapshot:<tenantId>:<pipelineId>:<branchId-or-_no_branch>:<currencyCode>:<snapshotDate>:<sourceRunId>`.
  Branchless snapshots use the literal `_no_branch` sentinel. The `crm-forecast-snapshot:` prefix is
  reserved for CRM13 and follow-on revisions of this scheduler; future scheduler families must use
  distinct prefixes.
- Rerun behavior: a new authorized logical run for the same date appends the next snapshot version;
  CRM13 does not update or delete existing snapshots.
- Duplicate keys inside a single insert batch are treated as a scheduler bug and surfaced as
  `version_conflict` rather than silently coalesced.
- Overlapping runs: CRM13 holds no lock. Overlapping cron/manual invocations are safe because each
  run has a distinct `sourceRunId`, and cross-request row conflicts resolve through CRM05's
  unique-version retry loop. If the repository still returns `version_conflict`, the row contributes
  to `versionConflicts`.
- Output: aggregate counts only. The route response and logs must not contain lead, contact, email,
  phone, notes, subject, description, or raw activity text.
- Error responses: cron responses use fixed English machine-readable strings, not locale messages.
- Secret rotation: `CRON_SECRET` rotation is owned by existing ops/secret-management practice and
  the shared cron helper; CRM13 does not add rotation workflow.
- Health posture: no separate health endpoint is added; CRM18 owns observability and health
  improvements.

### Result And Status Contract

CRM13 returns a stable aggregate result shape, including successful no-op runs:

```ts
type CrmForecastSnapshotSchedulerResult = {
  sourceRunId: string;
  snapshotDate: string;
  workItemsConsidered: number;
  workItemsSucceeded: number;
  workItemsDeferred: number;
  failedWorkItems: number;
  versionConflicts: number;
  snapshotsInserted: number;
  startedAt: string;
  completedAt: string;
};
```

Status-code policy:

- `200` for full success, successful empty-set no-op, and partial failure.
- `401` for missing or bad bearer authorization.
- `500` only when the core cannot initialize or every selected work item fails.

### Logging Contract

- Emit one structured log line per authorized run; no per-row logs.
- Log fields: `sourceRunId`, `snapshotDate`, every result counter, and `durationMs`.
- Use `info` for normal completion.
- Use `warn` when `failedWorkItems > 0`, `versionConflicts > 0`, or `workItemsDeferred > 0`.
- Use `error` only when the route returns `500`.

## Work Item Contract

CRM13 needs an app-side work-item projection, not a new domain aggregate:

```ts
type CrmForecastSnapshotWorkItem = {
  tenantId: string;
  branchId?: string | null;
  pipelineId: string;
  currencyCode: string;
};
```

Exported constants:

- `CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN = 1000`.
- `CRM_FORECAST_SNAPSHOT_TARGET_DURATION_MS = 60000`.
- `CRM_FORECAST_SNAPSHOT_WORK_ITEM_SOFT_TIMEOUT_MS = 5000`.
- `CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL = '_no_branch'`.

The projection is adapter-owned and may be derived from normalized CRM04/CRM05 tables. It must:

- Exclude archived pipelines and archived deals from work-item discovery.
- Include only work items with at least one normalized deal row for the selected snapshot date.
- Keep tenant ID explicit on every repository call.
- Prefer normalized CRM04 fields; it must not group by legacy `crm_deals.stage` text.
- Carry `db-access-guard` comments on new tenant-scoped queries.
- Use a single grouped query with a bounded limit. When the cap is hit, extra work contributes to
  `workItemsDeferred`; continuation/backfill is deferred to `P38-CRM17`.

## Failure And Concurrency Semantics

- Unauthorized requests perform no DB reads or writes.
- Missing `CRON_SECRET` fails closed and returns `401`, matching the existing cron helper behavior.
- Empty tenant/work-item sets are successful no-ops with zero inserted snapshots.
- A work-item read failure increments `failedWorkItems` and does not block unrelated tenants.
- A snapshot insert `version_conflict` increments `versionConflicts` and is returned in the aggregate
  result for that work item.
- Duplicate keys inside one insert batch are a scheduler bug and surface as `version_conflict`.
  Cross-batch duplicates from parallel HTTP requests are resolved by the CRM05 repository retry loop;
  any final conflict increments `versionConflicts`.
- Unexpected exceptions for one tenant/pipeline are captured in aggregate counters and logged without
  PII. The route returns `500` only when the scheduler core itself cannot initialize or every selected
  work item fails.
- Snapshot insert concurrency remains owned by the CRM05 repository unique-version retry loop. CRM13
  must not add advisory locks in this slice.

## Acceptance Criteria

- `GET /api/cron/crm/forecast-snapshots` is protected by `CRON_SECRET` and fails closed before any
  repository calls on unauthorized requests.
- The route delegates to a thin scheduler core; the route handler does not contain reporting SQL or
  snapshot derivation logic.
- The scheduler core derives the previous UTC snapshot date by default and validates authorized
  manual date overrides.
- Snapshot rows are derived through CRM05 reporting functions and persisted through the CRM05
  forecast snapshot repository.
- Snapshot writes are append-only; no update/delete path is introduced.
- `sourceRunId` and `idempotencyKey` are populated according to the scheduler contract.
- Empty work-item sets return the full stable result object with zero counters.
- Partial failures are counted and surfaced without leaking PII.
- The implementation does not modify UI, schema/migrations, proxy, canonical routes, auth/tenancy
  architecture, Stripe, README, AGENTS.md, or broad architecture docs.

### Coverage Discipline

- Route tests must cover missing secret, bad bearer token, valid bearer token, and no-DB-work before
  authorization succeeds.
- Scheduler-core tests must cover default date selection, explicit date validation, future-date
  rejection, previous-day-only override, empty work items, successful append, work-item cap deferral,
  soft timeout, `version_conflict`, and partial failure.
- Repository/work-item tests must prove tenant scoping and normalized-field grouping without legacy
  stage-text grouping.
- A PII-shape regression test must assert route/core outputs do not expose `email`, `phone`,
  `fullName`, `notes`, `description`, `subject`, or raw activity fields.
- Every `success | error` result branch added by CRM13 needs a dedicated test.

## Risks And Open Questions

- **Scheduler platform config.** The repo currently has cron routes and Inngest functions but no
  checked-in root `vercel.json`; CRM13 should implement the route/core first and document deployment
  wiring rather than inventing a new platform config if none exists.
- **Long-running tenants.** The first slice uses bounded batches and aggregate counters, but a later
  scale gate may need queue fanout or durable per-tenant jobs.
- **UTC-only snapshots.** Tenant-local business-day snapshots are deferred. CRM13 uses UTC to match
  DG07 snapshot semantics.
- **Idempotency depth.** CRM13 reserves row-level idempotency keys but does not add a durable run
  ledger. Replays intentionally append new versions through the existing CRM05 contract.
- **Admin/staff consumption.** Admin/staff dashboards remain deferred until scheduled data exists and
  the generated rows have operational history.

## Dependency / Sequencing

CRM13 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM12 Reporting Dashboard UI`.
- Existing cron auth/rate-limit route conventions.

CRM13 should land before:

- `P38-CRM14 Admin Reporting Dashboard UI`.
- `P38-CRM15 Staff Reporting Dashboard UI`.
- Any snapshot backfill/history UI or charting-foundation slice.

CRM13 is independent of routing persistence (`P38-CRM08`), routing admin UX (`P38-CRM09`), legacy
deal column retirement (`P38-CRM10`), and CRM04 nullability tightening (`P38-CRM11`).

## Non-Goals

- Forecast snapshot schema changes, migrations, RLS changes, or run-ledger tables.
- Historical snapshot backfill.
- Historical manual date ranges beyond the previous UTC day.
- Tenant-local timezone snapshot days.
- Dashboard UI changes, admin/staff reporting UI, charting, or visual-regression baselines.
- Alerting integrations, Slack/email notifications, or external observability dashboards.
- Routing persistence, routing admin UX, legacy deal cleanup, or nullability tightening.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS.md, or broad
  architecture-doc changes.

## Verification Plan

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/cron/crm/forecast-snapshots'`
- `pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting/index.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm check:db-access`
- `pnpm plan:audit` to validate the canonical program/tracker model and referenced governed docs.
- `pnpm track:audit` to validate the delivery tracker contract.
- `scripts/ci/db-access-baseline.json` must be updated if the work-item query changes the guarded DB
  access baseline; otherwise the PR must document why no baseline change was required.
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `interdomestik_qa.scope_audit` with docs plus explicitly authorized cron/reporting scheduler paths.

## Promotion Boundary

Merging this gate authorizes `P38-CRM13 Forecast Snapshot Scheduler` only. It does not authorize
dashboard UI, schema changes, run-ledger persistence, charting, admin/staff reporting, routing
persistence, cleanup/tightening gates, proxy edits, canonical route changes, or auth/tenancy
architecture changes.

## Promotion / Sign-Off

| Slice                                                    | Status   | Authority                | Notes                                                                |
| -------------------------------------------------------- | -------- | ------------------------ | -------------------------------------------------------------------- |
| `P38-CRM06 Lead Dedupe Domain Foundation`                | complete | PR `#750`                | Merge commit `c7412618c9f55adf85a75d8f06d7b5de51961254`.             |
| `P38-CRM07 Lead Routing Domain Foundation`               | complete | PR `#751`                | Merge commit `dce513248cee825ae5e7d616f17c489a80422a1e`.             |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete | PR `#756`                | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.             |
| `P38-CRM12 Reporting Dashboard UI`                       | complete | PR `#757`                | Merge commit `3a220ea88eb0c2b765b56d3d926edd21952b3def`.             |
| `P38-DG09 Forecast Snapshot Scheduler Design Review`     | complete | tracker/program gate     | Promotes exactly one bounded scheduler slice.                        |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | promoted | `P38-DG09`               | Protected cron route and testable scheduler core only.               |
| `P38-CRM14 Admin Reporting Dashboard UI`                 | reserved | post-scheduler           | Admin aggregate reporting UI remains deferred.                       |
| `P38-CRM15 Staff Reporting Dashboard UI`                 | reserved | post-scheduler/admin     | Staff/branch reporting UI remains deferred.                          |
| `P38-CRM16 Reporting Charting Foundation`                | reserved | later gate               | Charting dependency and bundle-size policy remain deferred.          |
| `P38-CRM17 Forecast Snapshot Backfill`                   | reserved | later gate               | Historical backfill and operator runbook remain deferred.            |
| `P38-CRM18 Forecast Snapshot Observability`              | reserved | later gate               | Alerting and run telemetry dashboards remain deferred.               |
| `P38-CRM19 Forecast Snapshot Backfill Operator UX`       | reserved | post-backfill            | Operator-facing backfill controls remain deferred.                   |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | future gate              | Still valid, but not selected ahead of snapshot automation.          |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing-persistence | Requires routing persistence first.                                  |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | later gate               | Requires normalized-reader confidence and explicit retirement proof. |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate               | Requires production zero-null evidence.                              |
