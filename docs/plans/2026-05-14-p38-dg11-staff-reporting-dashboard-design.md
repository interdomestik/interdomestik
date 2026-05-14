# P38-DG11 Staff Reporting Dashboard UI Design Review

Status: design-review
Slice: `P38-DG11`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-14
Authority: this gate opens `P38-CRM15 Staff Reporting Dashboard UI` only.
Promoted implementation slice: `P38-CRM15 Staff Reporting Dashboard UI`

## Status / Predecessor Closeout

`P38-CRM14 Admin Reporting Dashboard UI` is complete through PR `#761`, merge commit
`de4e60c4ed79d81a6f92e721a4ad04ab1944151b`, with closeout sync through PR `#762`, merge commit
`e7f390b7fca45320ef2d1cdb58748051457881ed`. The merged slice adds:

- Chart-free `/admin/crm` aggregate reporting UI consuming CRM05 reporting and forecast-snapshot
  repositories.
- `admin-crm-page-ready` plus `admin-crm-reporting-*` widget markers.
- Tenant-wide admin aggregate authorization, mandatory admin-sidebar discoverability, and
  `sq`/`en`/`sr`/`mk` locale coverage.
- PII-safe route-core output shapes and a colocated PII regression test.
- Copilot hardening for real reporting-denial propagation and tenantless admin-like fail-closed
  behavior.
- Remote proof for SonarCloud, Copilot/pr-finalizer, audit, unit, static, PR E2E, e2e-gate, Pilot
  Gate Preflight/Runner, pilot-gate, commitlint, gitleaks, pnpm-audit, validation-surface, and
  Vercel ignored-build/preview-comment checks.
- Notion sync recorded under `PR 761 P38 CRM14 Admin Reporting Dashboard UI`.

DG11 therefore closes the post-CRM14 state and promotes the next bounded staff reporting UI slice.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM15 Staff Reporting Dashboard UI`

CRM05 created the reporting read-models, CRM12 proved agent dashboard consumption, CRM13 generates
daily forecast snapshots, and CRM14 established the admin aggregate UI contract. The next useful
dashboard slice is a staff-only operational CRM reporting surface under canonical `/staff` that helps
staff understand pipeline flow and bottlenecks without adding chart dependencies, branch-manager
reporting, drilldowns, schema work, or new reporting SQL.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                               |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1    | `P38-CRM15 Staff Reporting Dashboard UI`           | Promote now. Staff need an operational CRM view after admin aggregate reporting is established.        |
| 2    | `P38-CRM16 Reporting Charting Foundation`          | Defer. Charting should follow stable chart-free staff/admin contracts and needs bundle/a11y proof.     |
| 3    | `P38-CRM18 Forecast Snapshot Observability`        | Defer. Scheduler observability is valuable but less user-visible than staff CRM reporting consumption. |
| 4    | `P38-CRM17 Forecast Snapshot Backfill`             | Defer. Historical backfill should follow live snapshot and UI consumption proof.                       |
| 5    | `P38-CRM20 Admin Reporting Branch-Manager Surface` | Defer. Branch-manager reporting needs a separate visibility/authorization contract.                    |
| 6    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Still valid, but independent from the reporting/snapshot UI sequence currently in flight.       |
| 7    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                            |
| 8    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                                 |

## Implementation Scope For P38-CRM15

Allowed:

- A new staff CRM reporting surface under the existing canonical `/staff` route group, expected as
  `/staff/crm`.
- A testable staff reporting core colocated with the route, following the CRM12/CRM14 route-core
  pattern.
- CRM05 reporting repository/domain read-model consumption through `apps/web/src/lib/domain-crm`.
- Chart-free widgets only, built from compact metric bands and tables.
- Localized staff CRM dashboard copy for the existing web locale set: `sq`, `en`, `sr`, and `mk`.
- A minimal staff navigation/sidebar link in the existing staff sidebar, gated to staff-role users
  only and limited to adding `/staff/crm` plus locale keys.
- Focused unit tests for authorization, empty states, markers, multi-currency display, output
  sorting/capping, and PII-safe output shape.
- Plan/tracker updates for the promoted slice and verification evidence.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- `/admin/crm`, `/agent/crm`, member UI, staff claims queue behavior, or staff support-handoff
  behavior beyond preserving their existing markers.
- Branch-manager CRM reporting access or sidebar discoverability; this remains `P38-CRM20`.
- Charting-library dependencies, visual-regression baselines, or bundle-size configuration.
- New CRM schema/migrations, snapshot table shape, run-ledger tables, RLS policies, or backfills.
- Forecast snapshot scheduler behavior.
- Routing persistence, routing admin UX, legacy deal column retirement, CRM04 nullability
  tightening, Stripe, README, AGENTS.md, or broad architecture docs.

## Widget Contract

CRM15 ships exactly three chart-free staff widgets:

1. **Pipeline workload.** Reads live CRM05 weighted pipeline rows and summarizes open pipeline by
   branch, pipeline, and currency. Shows open deal count, total pipeline amount, weighted amount,
   commit amount, best-case amount, and excluded-row counters. Commit and best-case amounts are
   live derivations from the same CRM05 weighted-pipeline rows by filtering
   `forecastCategory === 'commit'` / `forecastCategory === 'best'` and summing the CRM05 weighted
   amounts; CRM15 must not read forecast snapshots for these live cells.
2. **Funnel movement.** Reads CRM05 funnel-conversion rows and shows the top stage movement rows by
   entered count. Uses CRM05 period-entry semantics only by passing `mode: 'period_entry'`. Shows
   entered, exited, won, lost, conversion rate, and drop-off rate.
3. **Stage velocity.** Reads CRM05 stage-velocity rows and shows the slowest stage rows by median
   days. Open intervals are excluded by default. Stages with `sampleCount < 3` are excluded from the
   displayed slowest-stage list rather than rendered with a low-confidence marker. Shows median,
   average, minimum, maximum, sample count, and a widget-level excluded-open-interval counter.

### Exported Constants

CRM15 must export these constants from the staff CRM route core so tests and renderers share one
contract:

```ts
export const STAFF_CRM_REPORTING_WINDOW_DAYS = 90;
export const STAFF_CRM_PIPELINE_MAX_ROWS = 10;
export const STAFF_CRM_FUNNEL_MAX_STAGES = 12;
export const STAFF_CRM_STAGE_VELOCITY_MAX_STAGES = 12;
export const STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT = 3;
export const STAFF_CRM_REPORTING_MARKER_PREFIX = 'staff-crm-reporting-';
```

All three widgets use a default UTC reporting window of `now - STAFF_CRM_REPORTING_WINDOW_DAYS`
through `now`, computed once in the route core. The CRM05 `CRM_REPORTING_MAX_WINDOW_DAYS = 400` cap
still applies. Staff query-param window overrides are out of scope for CRM15.

Pipeline rows are sorted by open deal count descending, weighted amount descending, branch label
ascending, pipeline label ascending, then currency code ascending. `STAFF_CRM_PIPELINE_MAX_ROWS`
applies after currency grouping/explosion, so a tenant with multiple currencies may render fewer than
all `(branch, pipeline)` tuples. Funnel rows are unique per `(pipelineId, stageId)`; if the route core
receives duplicate rows, it merges them by summing count fields and recomputing rates with CRM05
basis-point rules before sorting. `STAFF_CRM_FUNNEL_MAX_STAGES` applies post-deduplication and
post-sort. Funnel rows are sorted by entered count descending, pipeline ID ascending, then stage ID
ascending. Stage-velocity rows with `sampleCount < STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT` are
excluded before sorting, and `STAFF_CRM_STAGE_VELOCITY_MAX_STAGES` applies post-filter and post-sort.
Stage-velocity rows are sorted by median days descending, sample count descending, pipeline ID
ascending, then stage ID ascending.

### Widget Output Shapes

CRM15 route-core output must expose typed projections for renderer fixtures and PII regression
tests:

```ts
export interface StaffCrmPipelineWorkloadRow {
  branchId: string | null;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  openDealCount: number;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  forecastCommitAmountMinor: number;
  forecastBestAmountMinor: number;
  excludedInconsistentForecastCount: number;
}

export interface StaffCrmFunnelMovementRow {
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  enteredCount: number;
  exitedCount: number;
  wonCount: number;
  lostCount: number;
  conversionRateBps: number;
  dropOffRateBps: number;
}

export interface StaffCrmStageVelocityRow {
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  sampleCount: number;
  averageDays: number;
  medianDays: number;
  minimumDays: number;
  maximumDays: number;
}

export interface StaffCrmStageVelocityWidgetSummary {
  rows: readonly StaffCrmStageVelocityRow[];
  excludedOpenIntervalCount: number;
}
```

These shapes are aggregate-only. They must not contain lead/contact/member names, email, phone,
notes, descriptions, subjects, raw activity text, or row-level CRM identifiers outside
branch/pipeline/stage aggregate-safe reporting IDs.

The route core owns all label fallback. `branchLabel`, `pipelineLabel`, and `stageLabel` are
non-nullable because the route core must populate each with a safe label or the corresponding stable
ID fallback before data reaches the renderer. When `branchId === null`, the route core sets
`branchLabel` to the localized `staff-crm:label.no-branch` value and groups the row under that label
like any other branch bucket.

### Widget State Rules

- Loading: server-rendered page may omit client spinners; any client-side suspense boundary must use
  the existing staff skeleton style.
- Empty state: each widget has localized empty copy and remains visible when the underlying reporting
  rows are empty.
- Error state: reporting denials and repository failures fail closed with localized staff-safe copy;
  raw denial details are not exposed in the UI, but raw typed denial reasons may be logged
  server-side without PII for operations.
- Currency: display amounts with `Intl.NumberFormat` and the ISO currency code suffix. Symbols alone
  are not sufficient because CRM05 does not perform currency conversion. When a tenant has multiple
  currencies, use stacked rows grouped by ISO code; no tabs or client-side currency state in CRM15.
  Forecast amounts use full localized numbers, not compact K/M abbreviations.
- Percentages: display basis-point percentages with one decimal place, matching CRM12 formatting.
- Durations: display stage velocity in days with the CRM05 duration precision, using localized number
  formatting.
- Excluded counters: show reason-neutral excluded-row counts through the existing tooltip/info
  pattern with `Intl.NumberFormat`; do not reveal row-level reasons or PII.
- Markers: the page exposes `staff-crm-page-ready` after all three widgets have rendered with data,
  rendered their empty state, or surfaced their fail-closed error state. Widget marker IDs are
  derived from `STAFF_CRM_REPORTING_MARKER_PREFIX` as
  `${STAFF_CRM_REPORTING_MARKER_PREFIX}pipeline-workload`,
  `${STAFF_CRM_REPORTING_MARKER_PREFIX}funnel-movement`, and
  `${STAFF_CRM_REPORTING_MARKER_PREFIX}stage-velocity`.
- PII: outputs must not include lead/contact/member names, emails, phones, notes, descriptions,
  subjects, or raw activity text.

### Error Copy Mapping

| Reporting denial reason | Message identifier         |
| ----------------------- | -------------------------- |
| `tenant_scope`          | `staff-crm:error.tenant`   |
| `role_scope`            | `staff-crm:error.role`     |
| `branch_scope`          | `staff-crm:error.branch`   |
| `agent_scope`           | `staff-crm:error.agent`    |
| `window_scope`          | `staff-crm:error.window`   |
| `unsupported_grouping`  | `staff-crm:error.grouping` |
| repository failure      | `staff-crm:error.generic`  |

## Per-Role Visibility

| Role             | CRM15 behavior                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `staff`          | May access `/staff/crm` and sees staff operational aggregate widgets for the tenant.     |
| `branch_manager` | No CRM15 access or staff-sidebar CRM link; branch-manager reporting remains `P38-CRM20`. |
| `admin`          | No new `/staff/crm` access in this slice; existing `/admin/crm` remains CRM14-owned.     |
| `agent`          | No access to `/staff/crm`; existing `/agent/crm` remains CRM12-owned.                    |
| `member`         | No access.                                                                               |

CRM15 is staff-role operational reporting only. Peer leaderboards and branch-manager peer comparison
remain out of scope because they need a separate identity-label and peer-comparison policy.

Authorization is enforced in three layers:

1. Existing canonical-route authority gates the `/staff` route group.
2. The CRM15 route core re-checks the session role and permits only `staff` before any CRM reporting
   repository call. `branch_manager` is denied in CRM15 even though the broader staff shell can host
   branch-manager routes.
3. CRM05 reporting authorization remains the final defense at the reporting repository/domain
   boundary.

Any silent bypass of these layers is a security regression. The route-core role check is the
load-bearing CRM15 enforcement point reviewers should inspect first, with the route group and CRM05
reporting authorization providing defense in depth.

## Acceptance Criteria

- `/staff/crm` renders for an authorized staff session and exposes `staff-crm-page-ready`.
- Branch-manager, admin, agent, member, and tenantless staff-like sessions fail closed before CRM
  reporting repository reads.
- The existing staff sidebar exposes a `/staff/crm` entry only for staff-role users using the
  established staff sidebar pattern.
- All CRM reporting data flows through CRM05 app-side repositories and domain read models.
- Route components do not contain ad hoc reporting SQL.
- The three in-scope widgets render with data, empty, and error-state proof.
- Pipeline workload, funnel movement, and stage velocity output are capped and sorted by the exported
  constants.
- All widgets use the exported 90-day default reporting window and do not accept query-param window
  overrides.
- Multi-currency values remain grouped and displayed without conversion.
- Reporting authorization failures fail closed before aggregate data is rendered.
- UI outputs remain PII-safe and aggregate-only.
- Existing `/staff`, `/staff/claims`, `/staff/claims/[id]` claim-messaging behavior,
  `/staff/support-handoffs`, `/admin/crm`, and `/agent/crm` markers and behavior remain unchanged.

### Coverage Discipline

- Core tests must cover authorized staff access, denied branch-manager/admin/agent/member roles,
  tenantless fail-closed behavior, reporting denial mapping, repository failure mapping, empty rows,
  successful rows, output sort/cap behavior, multi-currency rows, and PII-shape regression.
- Page/component tests must assert `staff-crm-page-ready` and all three widget markers.
- Staff sidebar tests must prove `/staff/crm` is visible to staff-role users and not visible for
  branch-manager, admin, agent, member, tenantless, or missing-role sessions.
- Locale coverage must include `sq`, `en`, `sr`, and `mk` for new staff CRM strings.
  This is the current CRM-reporting locale set for CRM15; if additional web locales are introduced
  before implementation, CRM15 must include them or explicitly record translation debt in its PR.
- The PII regression test must live at
  `apps/web/src/app/[locale]/(staff)/staff/crm/_core.pii.test.ts` or an equivalently colocated
  `*.pii.test.ts` file, and must ensure output row keys do not include `email`, `phone`,
  `fullName`, `name`, `notes`, `description`, `subject`, or raw activity fields.
- Every `success | error` branch added by CRM15 needs a dedicated test.

## Risks And Open Questions

- **Staff route admits branch managers.** The existing staff shell permits `staff` and
  `branch_manager`. CRM15 must explicitly deny branch-manager reporting and hide the sidebar entry
  unless the user role is `staff`.
- **Operational labels.** Branch, pipeline, and stage labels may require existing safe labels. CRM15
  must avoid new PII joins and may display stable branch/pipeline/stage identifiers if safe labels
  are unavailable.
- **Funnel and velocity interpretation.** CRM15 must use CRM05 semantics: period-entry funnel rows,
  stage-history-only velocity intervals, and open intervals excluded by default.
- **Performance.** First-slice target is `< 500 ms` p95 per widget against seeded/local data.
  The CRM15 budget is measured from local seeded route-core tests or Playwright traces and is
  informational only across the current CRM reporting series unless a later gate explicitly promotes
  CI-blocking performance enforcement.
- **No charts.** Charting is deferred to avoid bundle-size, visual-regression, and chart-accessibility
  scope in the first staff slice.
- **DB access baseline.** CRM15 is expected to reuse CRM05 reporting adapters without adding new SQL.
  `pnpm check:db-access` is still required; any new tenant-scoped SQL requires an explicit baseline
  update in the implementation PR.

## Dependency / Sequencing

CRM15 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM12 Reporting Dashboard UI`.
- `P38-CRM13 Forecast Snapshot Scheduler`.
- `P38-CRM14 Admin Reporting Dashboard UI`.

CRM15 should land before:

- `P38-CRM16 Reporting Charting Foundation`.
- `P38-CRM20 Admin Reporting Branch-Manager Surface`.
- Snapshot observability/backfill UI that assumes staff reporting consumption.

CRM15 is independent of routing persistence (`P38-CRM08`), routing admin UX (`P38-CRM09`), legacy
deal column retirement (`P38-CRM10`), and CRM04 nullability tightening (`P38-CRM11`).

## Non-Goals

- `/admin/crm` changes or admin reporting branch-manager behavior.
- Branch-manager CRM reporting UI or sidebar access.
- Agent CRM reporting changes beyond preserving CRM12 behavior.
- Leaderboards, peer-by-name comparisons, funnel charts, velocity charts, or visual-regression
  baselines.
- Staff reporting date-window query overrides.
- New charting dependencies or bundle-size budget changes.
- Forecast snapshot scheduler changes, run-ledger persistence, historical backfill, or observability
  integrations.
- CRM schema/migrations, RLS changes, routing persistence, routing admin UX, legacy deal cleanup, or
  nullability tightening.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS.md, or broad
  architecture-doc changes.

## Verification Plan

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(staff)/staff/crm'`
- `pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting/index.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/staff/staff-sidebar.test.tsx`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web lint -- 'src/app/[locale]/(staff)/staff/crm' src/components/staff/staff-sidebar.tsx src/components/staff/staff-sidebar.test.tsx src/i18n/messages.ts`
  is a focused lint command for the slice; it does not replace the project-level lint run inside
  `pnpm pr:verify`.
- `pnpm i18n:check`
- `pnpm i18n:purity:check`
- `pnpm check:db-access`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `interdomestik_qa.scope_audit` with docs plus explicitly authorized staff CRM reporting paths.

## Promotion Boundary

This gate opens `P38-CRM15 Staff Reporting Dashboard UI` only. It does not authorize branch-manager
reporting, admin reporting changes, charting, schema changes, scheduler changes, run-ledger
persistence, backfill, observability, routing persistence, cleanup/tightening gates, proxy edits,
canonical route changes, or auth/tenancy architecture changes.

## Promotion / Sign-Off

| Slice                                                    | Status        | Authority            | Notes                                                       |
| -------------------------------------------------------- | ------------- | -------------------- | ----------------------------------------------------------- |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete      | PR `#756`            | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.    |
| `P38-CRM12 Reporting Dashboard UI`                       | complete      | PR `#757`            | Merge commit `3a220ea88eb0c2b765b56d3d926edd21952b3def`.    |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | complete      | PR `#759`            | Merge commit `5544ffdea752031086a5bf5cda8b5892af6e3a83`.    |
| `P38-CRM14 Admin Reporting Dashboard UI`                 | complete      | PR `#761`            | Merge commit `de4e60c4ed79d81a6f92e721a4ad04ab1944151b`.    |
| `P38-DG11 Staff Reporting Dashboard UI Design Review`    | design-review | tracker/program gate | Promotes exactly one bounded staff dashboard UI slice.      |
| `P38-CRM15 Staff Reporting Dashboard UI`                 | promoted      | `P38-DG11`           | Staff operational aggregate reporting UI only.              |
| `P38-CRM16 Reporting Charting Foundation`                | reserved      | later gate           | Charting dependency and bundle-size policy remain deferred. |
| `P38-CRM17 Forecast Snapshot Backfill`                   | reserved      | later gate           | Historical backfill and operator runbook remain deferred.   |
| `P38-CRM18 Forecast Snapshot Observability`              | reserved      | later gate           | Alerting and run telemetry dashboards remain deferred.      |
| `P38-CRM19 Forecast Snapshot Backfill Operator UX`       | reserved      | post-backfill        | Operator-facing backfill controls remain deferred.          |
| `P38-CRM20 Admin Reporting Branch-Manager Surface`       | reserved      | post-staff/admin     | Branch-manager reporting surface remains deferred.          |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved      | future gate          | Still valid, but not selected ahead of staff reporting.     |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved      | post-routing         | Requires routing persistence first.                         |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved      | later gate           | Requires normalized-reader confidence and retirement proof. |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved      | later gate           | Requires production zero-null evidence.                     |
