# P38-DG14 Forecast Snapshot Observability Design Review

Status: complete
Slice: `P38-DG14`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-15
Authority: this gate opens `P38-CRM18 Forecast Snapshot Observability` only.
Recommended implementation slice: `P38-CRM18 Forecast Snapshot Observability`
Promoted implementation slice: `P38-CRM18 Forecast Snapshot Observability`

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice.

## Status / Predecessor Closeout

`P38-CRM20 Admin Reporting Branch-Manager Surface` is complete through PR `#768`, merge commit
`6d1175116d44c60bd320ac67d479e822180d6503`. The merged slice added branch-manager access to the
existing `/admin/crm` route without changing proxy, canonical route names, auth/session layering,
tenant isolation architecture, schema, scheduler behavior, backfill, or observability integrations.

CRM12, CRM14, CRM15, CRM16, and CRM20 now provide stable reporting consumption across agent, admin,
staff, and branch-manager CRM surfaces. CRM13 already runs the protected forecast snapshot scheduler
and emits PII-safe aggregate scheduler results, but the repo still lacks a first-class operator view
for whether the latest snapshot coverage is complete for the previous UTC day.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM18 Forecast Snapshot Observability`

The recommended slice should make snapshot health visible on the existing admin CRM surface before
historical backfill or operator backfill UX is promoted. It should not introduce a run ledger,
alerting integration, new route, chart dependency, or scheduler mutation in the first observability
pass. The useful first contract is a chart-free, admin-only operational band derived from existing
forecast snapshot rows and the same expected work-item projection used by CRM13.

DG14 approval permits the implementation PR to update `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, and proof metadata for `P38-DG14` / `P38-CRM18`.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                         |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | `P38-CRM18 Forecast Snapshot Observability`        | Recommend for review. Operators need snapshot coverage/freshness before backfill is promoted.    |
| 2    | `P38-CRM17 Forecast Snapshot Backfill`             | Defer. Backfill should follow an observability surface that can show missing or stale snapshots. |
| 3    | `P38-CRM21 Visual Regression Baseline`             | Defer. Valuable, but less urgent than making snapshot health inspectable.                        |
| 4    | `P38-CRM19 Forecast Snapshot Backfill Operator UX` | Defer. Requires backfill semantics and should not precede observability/backfill proof.          |
| 5    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Still valid, but independent from the forecast snapshot operations sequence.              |
| 6    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires routing persistence first.                                                       |
| 7    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                      |
| 8    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                           |

## Implementation Scope For P38-CRM18

Allowed:

- A chart-free forecast snapshot observability band on the existing `/admin/crm` surface for
  admin-like sessions only.
- Route-core additions under the existing admin CRM route that compute snapshot health after the
  admin actor is resolved.
- App-side `domain-crm` observability repository helpers that reuse CRM13 expected work-item
  semantics and CRM05 forecast snapshot repository data.
- Aggregate snapshot coverage, freshness, missing-key, and observed-batch rows for the previous UTC
  snapshot date.
- Localized empty, delayed, stale, and missing-state copy for `sq`, `en`, `sr`, and `mk`.
- Focused route-core, page/component, i18n, E2E marker, DB-access, and PII regression tests.
- Program/tracker updates for the promoted slice only after this design review is approved.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names, route authority, auth/session layering, or tenant isolation architecture.
- Schema/migrations, RLS policies, run-ledger tables, or forecast snapshot table shape.
- Scheduler write behavior, cron authorization, Vercel cron config, snapshot idempotency semantics,
  historical backfill, or operator backfill controls.
- `/agent/crm`, `/staff/crm`, member UI, unrelated admin pages, or branch-manager CRM output shapes.
- New chart renderers, chart dependencies, visual-regression baseline infrastructure, or broad CRM
  dashboard redesign.
- Alerting integrations, Slack/email notifications, external observability dashboards, log-scraping
  integrations, routing persistence, routing admin UX, legacy deal cleanup, CRM04 nullability
  tightening, Stripe, README, AGENTS.md, or broad architecture docs.

## Route And Authorization Contract

CRM18 uses the existing `/admin/crm` page. It must not add `/admin/crm/snapshots`, add a
`/staff/crm` observability surface, add a branch-manager-specific route, or change proxy behavior.

Authorization is enforced in the existing admin CRM route core:

1. Existing canonical route authority admits only roles already allowed into the `/admin` shell.
2. `/admin/crm` resolves session tenant, actor ID, and role using the existing admin CRM route
   boundary.
3. `admin`, `tenant_admin`, and `super_admin` sessions may receive the CRM18 observability band
   through the existing CRM `admin` actor mapping.
4. `branch_manager` sessions continue to dispatch to the CRM20 branch-manager core and must not
   receive CRM18 observability rows in the first slice.
5. Staff, agent, member, tenantless, and actorless sessions fail closed before observability
   repository reads.
6. CRM05/CRM13 app-side domain boundaries remain the final data boundary. UI components must not
   query snapshot tables directly.

The existing `admin-crm-page-ready` marker remains authoritative for page readiness. CRM18 markers
must not make the page-ready marker wait for extra client-side work.

## Observability Contract

CRM18 answers one operational question: for the frozen previous UTC snapshot date, did the expected
tenant/pipeline/branch/currency work items produce the latest append-only snapshot rows?

The implementation should derive:

- **Summary.** Counts expected work items, deferred expected work items, observed work items,
  missing work items, delayed rows, stale rows, unexpected observed work items, and the latest
  observed source run ID for the selected snapshot date.
- **Coverage.** One row per expected tenant/pipeline/branch/currency key after tenant scoping,
  showing snapshot status and latest observed snapshot metadata.
- **Observed batches.** A bounded grouping of observed snapshot rows by `sourceRunId` for the
  selected snapshot date. These are observed batches, not durable scheduler runs, because CRM18 does
  not introduce a run ledger.

CRM18 must not infer failure counters that are only available in transient CRM13 scheduler responses.
It may display `sourceRunId`, created timestamps, observed row counts, branch counts, pipeline
counts, and currency counts from persisted snapshot rows. It must not call external logging systems
or parse deployment logs to reconstruct scheduler runs.

### Snapshot-Date Freezing

The route core computes the previous UTC snapshot date and `generatedAt` timestamp exactly once at
entry, then passes that frozen date and timestamp to every expected-work-item and snapshot read in
the same render pass. `generatedAt` is the route-core entry timestamp for the observability view; it
is not a database value and must not be confused with `latestSnapshotCreatedAt`.

Tests should use an injected `Clock` that advances past UTC midnight between repository calls, then
assert that summary, coverage, and observed-batch reads all consume the entry-time snapshot date and
entry-time `generatedAt` value.

### Expected Work Items

Expected work items reuse CRM13 semantics:

- Exclude archived deals, archived pipelines, and archived stages.
- Use normalized CRM04 fields, not legacy `crm_deals.stage` text.
- Group by explicit tenant ID, pipeline ID, branch ID, and ISO currency code.
- Treat `branchId === null` as its own no-branch key.
- Apply a discovery cap of
  `min(CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN, ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS)`.
  `expectedWorkItems` counts returned expected keys after that cap. If more expected work exists
  beyond the cap, the summary must expose the remainder in `expectedWorkItemsDeferred` so admins can
  tell coverage is partial.

CRM18 needs a tenant-scoped app-side repository/helper for admin observability. It must not import
the cron route handler into `/admin/crm`, and it must not run all-tenant work-item discovery for a
single-tenant admin page. Expected-work-item discovery must be filtered at the SQL
`WHERE tenant_id = ?` boundary, not by all-tenant discovery followed by an in-memory tenant filter.

### Snapshot Matching

- A persisted snapshot row matches an expected work item only when tenant ID, pipeline ID, branch ID
  including null, currency code, and snapshot date all match.
- A tenant-wide/null-branch row must not satisfy a branch-specific expected key.
- A branch-specific row must not satisfy a null-branch expected key.
- If multiple versions exist for the same key, CRM18 displays the highest numeric integer
  `snapshotVersion` only. Version comparison must not be lexicographic.
- Missing expected keys render `status: 'missing'` and do not borrow totals from another branch or
  from another snapshot date.
- `status` derives from the latest matching row against `generatedAt` using inclusive thresholds:
  `missing` when no matching snapshot row exists; `stale` when the latest matching row's `createdAt`
  is at least `ADMIN_CRM_FORECAST_OBSERVABILITY_STALE_AFTER_HOURS` old; `delayed` when it is at
  least `ADMIN_CRM_FORECAST_OBSERVABILITY_DELAYED_AFTER_HOURS` old and not stale; otherwise `fresh`.
- `unexpectedObservedWorkItems` counts unique `(tenantId, pipelineId, branchId, currencyCode)` tuples
  that exist in observed snapshot rows for the frozen snapshot date but not in the expected work-item
  set, deduped across snapshot versions.
- `latestSourceRunId` is selected from the observed batch whose `lastSnapshotCreatedAt` is maximum
  across the frozen snapshot date, with ties broken by `sourceRunId` ascending.
- `latestSnapshotCreatedAt` is the maximum `latestSnapshotCreatedAt` among matched coverage rows for
  the frozen snapshot date, or `null` when no matching rows exist.
- Observed snapshot rows that have no matching expected key may be counted as
  `unexpectedObservedWorkItems` in the summary, but the first slice renders only the aggregate count.
  It must not render raw unexpected rows, per-key breakdowns, or an expand control unless a later
  review approves that expansion.

### Exported Constants

CRM18 should export these constants from the admin CRM route core or a colocated admin forecast
observability core:

```ts
export const ADMIN_CRM_FORECAST_OBSERVABILITY_WINDOW_DAYS = 1;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS = 100;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_BATCH_ROWS = 10;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_DELAYED_AFTER_HOURS = 30;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_STALE_AFTER_HOURS = 48;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX = 'admin-crm-forecast-observability-';
```

The marker IDs derived from the prefix are:

- `${ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX}summary`
- `${ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX}coverage`
- `${ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX}batches`

Tests should import the constants rather than duplicating literal thresholds, caps, or marker names.

### Output Shapes

CRM18 route-core output must expose typed, aggregate-only projections for rendering and PII
regression tests:

```ts
export type AdminCrmForecastObservabilityStatus = 'fresh' | 'delayed' | 'stale' | 'missing';

export interface AdminCrmForecastObservabilitySummary {
  snapshotDate: string;
  generatedAt: string;
  expectedWorkItems: number;
  expectedWorkItemsDeferred: number;
  observedWorkItems: number;
  missingWorkItems: number;
  delayedWorkItems: number;
  staleWorkItems: number;
  unexpectedObservedWorkItems: number;
  latestSnapshotCreatedAt: string | null;
  latestSourceRunId: string | null;
}

export interface AdminCrmForecastObservabilityCoverageRow {
  branchId: string | null;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  snapshotDate: string;
  snapshotVersion: number | null;
  latestSnapshotCreatedAt: string | null;
  sourceRunId: string | null;
  status: AdminCrmForecastObservabilityStatus;
}

export interface AdminCrmForecastObservabilityBatchRow {
  sourceRunId: string;
  snapshotDate: string;
  firstSnapshotCreatedAt: string;
  lastSnapshotCreatedAt: string;
  observedWorkItems: number;
  branchCount: number;
  pipelineCount: number;
  currencyCount: number;
}
```

`branchLabel` and `pipelineLabel` fallback ownership belongs to the route core. Renderers never see
undefined labels. Null-branch rows render `admin-crm.labels.noBranch`; that message value must stay
aligned with `staff-crm.label.no-branch` for the same locale unless copy review changes both.
Missing friendly branch or pipeline labels fall back to the stable ID string.

Date and timestamp formats are stable: `snapshotDate` is `YYYY-MM-DD`; `generatedAt`,
`latestSnapshotCreatedAt`, `firstSnapshotCreatedAt`, and `lastSnapshotCreatedAt` are ISO UTC
timestamps in `YYYY-MM-DDTHH:mm:ss.sssZ` form.

Coverage-row nullability is tied to status. When `status === 'missing'`, `snapshotVersion`,
`latestSnapshotCreatedAt`, and `sourceRunId` are all `null`. When `status !== 'missing'`, all three
are non-null; zero, empty-string, or sentinel values are forbidden.

### Sort And Cap Semantics

- Coverage rows sort by `status` severity (`missing`, `stale`, `delayed`, `fresh`), then
  `branchLabel` ascending, `pipelineLabel` ascending, `currencyCode` ascending, `branchId` ascending,
  and `pipelineId` ascending. `branchId === null` participates in the label sort through the
  localized no-branch label string and uses a stable empty-string ID for the final branch ID
  tie-breaker.
- Coverage rows cap after sorting at
  `ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS`; hidden counts are shown in localized copy.
- Observed batch rows sort by `lastSnapshotCreatedAt` descending, then `sourceRunId` ascending, and
  cap at `ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_BATCH_ROWS`.
- Multi-currency values are not converted or summed across currencies. CRM18 may count currency
  keys, but it must not create converted totals.
- `branchCount`, `pipelineCount`, and `currencyCount` count unique branch IDs, pipeline IDs, and ISO
  currency codes in the observed batch, not snapshot rows.

## UI Contract

CRM18 adds one admin-only operational band to `/admin/crm`, below the existing snapshot/pipeline/source
reporting widgets unless implementation constraints justify a different placement. The band contains
summary metrics, a compact coverage table, and a bounded observed-batches table.

The UI is chart-free in CRM18. Existing CRM16 chart components remain unchanged, and CRM18 does not
add new observability charts. Empty expected work-item sets render a localized empty state that makes
clear no forecast snapshot work was expected for the previous UTC day.

Branch-manager sessions on `/admin/crm` must not see the CRM18 band, its markers, or its locale copy
as rendered content. Enforcement belongs in the DG13 route-core split: branch-manager sessions
dispatch to `branchManagerCrmReportingCore`, and that core must not import CRM18 observability
helpers. Their CRM20 branch-scoped reporting page remains unchanged.

## PII And Accessibility Rules

- Outputs must not include lead, contact, member, staff, agent, deal, email, phone, full name, notes,
  description, subject, or raw activity fields.
- Safe labels are limited to branch label, pipeline label, ISO currency code, status labels,
  snapshot date, source run ID, and aggregate counts.
- The PII regression test must assert both output keys and rendered text do not leak PII-shaped
  labels.
- Summary metrics and tables remain the authoritative representation. No chart-only or tooltip-only
  information is allowed.
- Dates and counts use the existing localized formatting for `sq`, `en`, `sr`, and `mk`.
- Missing, delayed, and stale states use text plus status styling; color is never the only signal.
- Status badges include both an icon and visible text. Reduced-motion and reduced-transparency
  preferences are honored where applicable; CRM18 must not add animated status effects.

## Acceptance Criteria

- `/admin/crm` renders the CRM18 observability band for `admin`, `tenant_admin`, and `super_admin`
  sessions only.
- Branch-manager sessions continue to render the CRM20 branch-manager dashboard without CRM18
  observability rows or markers.
- The route core freezes the previous UTC snapshot date once and shares it across summary, coverage,
  and observed-batch reads.
- Expected work-item keys are tenant-scoped and match CRM13 normalized grouping semantics.
- Snapshot coverage compares expected keys to the latest append-only snapshot version per exact
  tenant/pipeline/branch/currency/date key.
- Missing, delayed, stale, and fresh status derivation is deterministic and covered by focused tests.
- The implementation does not add run-ledger persistence, schema/migrations, scheduler mutation,
  new routes, chart dependencies, proxy changes, canonical route changes, auth/tenancy refactors, or
  unrelated CRM surfaces.

### Coverage Discipline

- Route-core tests cover admin success, tenantless/admin denial, branch-manager omission, frozen date
  reuse via advancing `Clock` injection, missing rows, stale rows at the exact threshold, delayed rows
  at the exact threshold, fresh rows, unexpected observed count deduped across versions,
  `latestSourceRunId` tie-breaking, deferred expected-work-item counts, and cap/sort semantics.
- App-side repository tests prove tenant scoping, normalized-field work-item grouping, latest-version
  snapshot selection, and exact branch/null-branch matching.
- Page/component tests cover visible markers, localized empty state, hidden-count copy, and absence
  of CRM18 markers for branch-manager render paths.
- PII tests cover both typed output shapes and rendered text.
- E2E smoke covers an admin session seeing the CRM18 band and a branch-manager session not seeing it
  on `/admin/crm`.
- i18n completeness and purity cover all new messages for `sq`, `en`, `sr`, and `mk`.

## Risks And Open Questions

- **Run history ambiguity.** Without a durable run ledger, CRM18 can show observed snapshot batches
  but not scheduler failure counters from historical runs. This draft treats durable run history as a
  later slice unless reviewers explicitly approve schema scope.
- **Backfill interaction.** Later CRM17 backfill could create historical snapshot rows with old
  `snapshotDate` values and current `createdAt` values. CRM18 should label rows by frozen
  `snapshotDate` and observed creation time rather than assuming the scheduler was the writer.
- **Branch-manager visibility.** CRM20 gave branch managers branch-scoped reporting, but CRM18
  observability is platform/admin operational data in this draft. Reviewers should decide whether a
  later branch-scoped health view is needed.
- **Expected-work-item cost.** The observability core repeats CRM13 expected-work-item discovery for
  a single tenant. The first slice should cap rows and stay tenant-scoped rather than creating
  cross-tenant fleet observability.

## Review Questions

1. Should CRM18 render on the existing `/admin/crm` page or create a separate admin subroute?
   Author recommendation: use the existing `/admin/crm` page and add one admin-only band. This avoids
   proxy/sidebar scope, keeps the route authority unchanged, and matches the UI Contract placement
   below the existing snapshot, pipeline, and source widgets.
2. Should branch managers see branch-scoped snapshot observability in CRM18?
   Author recommendation: no. Keep CRM18 admin-like only; branch-manager stale/empty reporting
   states remain on the CRM20 widgets.
3. Should CRM18 add a durable scheduler run ledger?
   Author recommendation: no for the first observability slice. Show observed snapshot batches from
   persisted rows and reserve run-ledger schema for a later explicitly reviewed slice.
4. Should CRM18 add alerting or external dashboard integrations?
   Author recommendation: no. Alerting should follow a durable run-ledger or stable health contract.

## Dependency / Sequencing

CRM18 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM13 Forecast Snapshot Scheduler`.
- `P38-CRM14 Admin Reporting Dashboard UI`.
- `P38-CRM16 Reporting Charting Foundation` for the progressive-enhancement policy, even though
  CRM18 itself remains chart-free.
- `P38-CRM20 Admin Reporting Branch-Manager Surface` to make `/admin/crm` role split semantics
  explicit before adding admin-only operational content.

CRM18 should land before:

- `P38-CRM17 Forecast Snapshot Backfill`.
- `P38-CRM19 Forecast Snapshot Backfill Operator UX`.
- Alerting, run-ledger, or external observability dashboard work.

CRM18 is independent of routing persistence (`P38-CRM08`), routing admin UX (`P38-CRM09`), legacy
deal column retirement (`P38-CRM10`), CRM04 nullability tightening (`P38-CRM11`), and visual
regression baseline infrastructure (`P38-CRM21`).

## Non-Goals

- New routes, canonical route changes, proxy changes, or sidebar changes.
- Schema/migrations, RLS changes, run-ledger tables, or durable scheduler-run history.
- Scheduler write behavior, cron authorization, source-run ID generation, idempotency semantics,
  Vercel cron config, or backfill implementation.
- Branch-manager, staff, agent, member, or public CRM UI changes.
- New charts, chart dependencies, visual-regression baselines, or broad dashboard redesign.
- Alerting integrations, Slack/email notifications, external dashboards, or log scraping.
- Routing persistence, routing admin UX, legacy deal cleanup, CRM04 nullability tightening, Stripe,
  README, AGENTS.md, or broad architecture-doc changes.

## Verification Plan

Draft-review verification for this document requires:

- `pnpm plan:audit`
- `pnpm docs:verify`
- `git diff --check` to reject whitespace errors before review.
- `interdomestik_qa.scope_audit` with docs-only allowed paths

Future implementation PR verification should include:

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/admin/crm'`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/domain-crm`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web lint -- 'src/app/[locale]/admin/crm' src/lib/domain-crm src/i18n/messages.ts`
- `pnpm --filter @interdomestik/web check:size` to prove CRM18 does not add a route-chunk
  regression while remaining chart-free.
- Focused `/admin/crm` E2E smoke for admin and branch-manager session paths.
- `pnpm check:db-access`
- `pnpm i18n:check`
- `pnpm i18n:purity:check`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `git diff --check`
- `interdomestik_qa.scope_audit` with allowed implementation paths only.
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`.

## Promotion Boundary

Merging this gate authorizes `P38-CRM18 Forecast Snapshot Observability` only. It does not authorize
run-ledger persistence, schema changes, scheduler mutation, backfill, alerts, new routes,
branch-manager observability, staff/agent/member UI, charting changes, proxy edits, canonical route
changes, auth/tenancy refactors, Stripe, README, AGENTS.md, or broad architecture-doc changes.

## Promotion / Sign-Off

| Slice                                                    | Status   | Authority     | Notes                                                                 |
| -------------------------------------------------------- | -------- | ------------- | --------------------------------------------------------------------- |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete | PR `#756`     | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.              |
| `P38-CRM12 Reporting Dashboard UI`                       | complete | PR `#757`     | Agent chart-free reporting consumption complete.                      |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | complete | PR `#759`     | Protected cron route and scheduler core complete.                     |
| `P38-CRM14 Admin Reporting Dashboard UI`                 | complete | PR `#761`     | Admin aggregate reporting UI complete.                                |
| `P38-CRM15 Staff Reporting Dashboard UI`                 | complete | PR `#764`     | Staff operational reporting UI complete.                              |
| `P38-CRM16 Reporting Charting Foundation`                | complete | PR `#767`     | Shared CRM reporting chart discipline complete.                       |
| `P38-CRM20 Admin Reporting Branch-Manager Surface`       | complete | PR `#768`     | Branch-manager route-core split and branch-scoped reporting complete. |
| `P38-DG14 Forecast Snapshot Observability Design Review` | complete | tracker gate  | Promotes exactly one bounded observability slice.                     |
| `P38-CRM18 Forecast Snapshot Observability`              | promoted | `P38-DG14`    | Admin-only chart-free snapshot health band.                           |
| `P38-CRM17 Forecast Snapshot Backfill`                   | reserved | later gate    | Historical backfill remains deferred.                                 |
| `P38-CRM19 Forecast Snapshot Backfill Operator UX`       | reserved | post-backfill | Operator-facing backfill controls remain deferred.                    |
| `P38-CRM21 Visual Regression Baseline`                   | reserved | later gate    | Visual baseline infrastructure remains deferred.                      |
| `P38-CRM22 Forecast Snapshot Alerting`                   | reserved | later gate    | Alerting requires a stable health or run-ledger contract first.       |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | future gate   | Still valid, but not selected ahead of observability.                 |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing  | Requires routing persistence first.                                   |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | later gate    | Requires normalized-reader confidence and retirement proof.           |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate    | Requires production zero-null evidence.                               |
