# P38-DG10 Admin Reporting Dashboard UI Design Review

Status: complete
Slice: `P38-DG10`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-14
Authority: this gate opens `P38-CRM14 Admin Reporting Dashboard UI` only.
Promoted implementation slice: `P38-CRM14 Admin Reporting Dashboard UI`

## Status / Predecessor Closeout

`P38-CRM13 Forecast Snapshot Scheduler` is complete through PR `#759`, merge commit
`5544ffdea752031086a5bf5cda8b5892af6e3a83`. The merged slice adds:

- Protected `GET /api/cron/crm/forecast-snapshots` cron route behavior.
- A scheduler core that composes CRM05 reporting derivation and append-only forecast snapshot
  persistence.
- A bounded work-item projection helper and `apps/web/vercel.json` cron entry.
- Soft-timeout, deferred-work, structured logging, version-conflict, and PII-safe aggregate response
  contracts hardened after Copilot review.
- Remote proof for SonarCloud, Copilot/pr-finalizer, unit, static, audit, E2E, e2e-gate, Pilot Gate
  Preflight/Runner, pilot-gate, commitlint, gitleaks, pnpm-audit, validation-surface, and Vercel
  ignored-build/preview-comment checks.
- Notion sync recorded under `PR 759 P38 CRM13 Forecast Snapshot Scheduler`.

DG10 therefore closes the post-CRM13 state and promotes the next bounded admin reporting UI slice.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM14 Admin Reporting Dashboard UI`

CRM05 created the reporting read-model and forecast snapshot persistence boundary. CRM12 proved the
first chart-free agent dashboard consumption pattern. CRM13 adds the daily snapshot generation path.
The next useful dashboard slice is an admin-only aggregate reporting surface under canonical `/admin`
that consumes the same CRM05 adapters without adding chart dependencies or widening into staff,
observability, backfill, routing, or schema work.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                            |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM14 Admin Reporting Dashboard UI`           | Promote now. Admin tenant-wide aggregate reporting is the next user-visible CRM credibility unlock. |
| 2    | `P38-CRM15 Staff Reporting Dashboard UI`           | Defer. Staff/branch reporting should reuse the admin surface contract after CRM14 lands.            |
| 3    | `P38-CRM18 Forecast Snapshot Observability`        | Defer. Useful after scheduler merge, but less user-visible than admin reporting consumption.        |
| 4    | `P38-CRM17 Forecast Snapshot Backfill`             | Defer. Historical backfill should follow live scheduler and admin snapshot consumption proof.       |
| 5    | `P38-CRM16 Reporting Charting Foundation`          | Defer. First admin slice stays chart-free to avoid bundle-size and chart accessibility scope.       |
| 6    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Still valid, but independent from the reporting/snapshot sequence currently in flight.       |
| 7    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                         |
| 8    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                              |

## Implementation Scope For P38-CRM14

Allowed:

- A new admin CRM reporting surface under the existing canonical `/admin` route group, expected as
  `/admin/crm`.
- A testable admin reporting core colocated with the route, following the CRM12 route/core pattern.
- CRM05 reporting repository/domain read-model consumption through `apps/web/src/lib/domain-crm`.
- CRM05 forecast snapshot repository reads for latest previous-UTC-day snapshot rows.
- Chart-free widgets only, built from compact metric bands and tables.
- Localized admin CRM dashboard copy for the existing web locale set: `sq`, `en`, `sr`, and `mk`.
- Focused unit tests for authorization, empty states, markers, multi-currency display, and PII-safe
  output shape.
- A minimal admin navigation/sidebar link in the existing admin sidebar, limited to adding the
  `/admin/crm` item and its locale keys without changing canonical routes or route authority.
- Plan/tracker updates for the promoted slice and verification evidence.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- `/agent/crm` behavior, `/staff/crm`, member UI, or staff support flows.
- Charting-library dependencies, visual-regression baselines, or bundle-size configuration.
- New CRM schema/migrations, snapshot table shape, run-ledger tables, RLS policies, or backfills.
- Forecast snapshot scheduler behavior beyond consuming its generated rows.
- Admin shell changes beyond the minimal sidebar item and message keys.
- Routing persistence, routing admin UX, legacy deal column retirement, CRM04 nullability
  tightening, Stripe, README, AGENTS.md, or broad architecture docs.

## Widget Contract

CRM14 ships exactly three chart-free admin widgets:

1. **Latest forecast snapshot.** Reads latest snapshot rows for the previous UTC snapshot date,
   grouped by currency. Shows snapshot date, total pipeline amount, weighted amount, open deal
   count, closed-won amount, closed-lost amount, and freshness/empty-state copy. Snapshot version is
   part of the typed projection for auditability but must not render as a standalone metric; it may
   appear only in a tooltip or accessible diagnostic label on the freshness/status element.
2. **Branch pipeline summary.** Reads live CRM05 weighted pipeline rows tenant-wide and summarizes by
   branch, pipeline, and currency. No currency conversion is allowed.
3. **Source breakdown.** Reads CRM05 source-breakdown rows tenant-wide and shows top source rows with
   total deal count, amount, weighted amount where available, and excluded-row counters.

### Exported Constants

CRM14 must export these constants from the admin CRM route core so tests and renderers share one
contract:

```ts
export const ADMIN_CRM_REPORTING_WINDOW_DAYS = 90;
export const ADMIN_CRM_REPORTING_SOURCE_TOP_N = 10;
export const ADMIN_CRM_REPORTING_MARKER_PREFIX = 'admin-crm-reporting-';
export const ADMIN_CRM_SNAPSHOT_DELAYED_AFTER_HOURS = 24;
export const ADMIN_CRM_SNAPSHOT_STALE_AFTER_HOURS = 48;
```

The live branch-pipeline and source-breakdown widgets use a default UTC reporting window of
`now - ADMIN_CRM_REPORTING_WINDOW_DAYS` through `now`, computed once in the route core. The CRM05
`CRM_REPORTING_MAX_WINDOW_DAYS = 400` cap still applies. Admin query-param window overrides are out
of scope for CRM14.

Source rows are capped to `ADMIN_CRM_REPORTING_SOURCE_TOP_N`, sorted by deal count descending, then
source label ascending, then currency code ascending. The `admin-crm-reporting-` marker prefix is
reserved for future admin CRM reporting widgets.

### Widget Output Shapes

CRM14 route-core output must expose typed projections for renderer fixtures and PII regression
tests:

```ts
export type AdminCrmSnapshotFreshness = 'fresh' | 'delayed' | 'stale' | 'missing';

export interface AdminCrmLatestSnapshotRow {
  snapshotDate: string;
  snapshotVersion: number;
  pipelineId: string;
  branchId: string | null;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  closedWonAmountMinor: number;
  closedLostAmountMinor: number;
  freshness: AdminCrmSnapshotFreshness;
}

export interface AdminCrmBranchPipelineRow {
  branchId: string | null;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  excludedInconsistentForecastCount: number;
}

export interface AdminCrmSourceBreakdownRow {
  sourceLabel: string;
  currencyCode: string;
  dealCount: number;
  totalAmountMinor: number;
  weightedAmountMinor: number;
  excludedInconsistentForecastCount: number;
}
```

These shapes are aggregate-only. They must not contain lead/contact/member names, email, phone,
notes, descriptions, subjects, raw activity text, or row-level CRM identifiers outside branch,
pipeline, and aggregate-safe reporting IDs.

### Freshness Rules

- `< 24h` since `snapshotDate` at route-core evaluation time: `fresh`, no badge.
- `24h` to `< 48h`: `delayed`, amber localized freshness badge.
- `>= 48h` or no snapshot rows: `stale` or `missing`, render the stale/empty state instead of
  presenting old amounts as current metrics.

The route core freezes `now`, the default reporting window, and the previous UTC snapshot date once
per request. Widget data fetching should run server-side in parallel with `Promise.all`; one slow
widget must not force sequential waits for the others.

Widget state rules:

- Loading: server-rendered page may omit client spinners; any client-side suspense boundary must use
  the existing admin skeleton style.
- Empty state: each widget has localized empty copy and remains visible when the underlying reporting
  rows are empty.
- Error state: reporting denials and repository failures fail closed with localized admin-safe copy;
  raw denial details are not exposed in the UI, but raw typed denial reasons may be logged
  server-side without PII for operations.
- Currency: display amounts with `Intl.NumberFormat` and the ISO currency code suffix. Symbols alone
  are not sufficient because CRM05 does not perform currency conversion. When a tenant has multiple
  currencies, use stacked rows grouped by ISO code; no tabs or client-side currency state in CRM14.
- Excluded counters: show reason-neutral excluded-row counts in a tooltip/info pattern with
  `Intl.NumberFormat`; do not reveal row-level reasons or PII.
- Markers: the page exposes `admin-crm-page-ready` after all three widgets have rendered with data,
  rendered their empty state, or surfaced their fail-closed error state. Widgets expose
  `admin-crm-reporting-snapshot`, `admin-crm-reporting-branch-pipeline`, and
  `admin-crm-reporting-source-breakdown`.
- PII: outputs must not include lead/contact/member names, emails, phones, notes, descriptions,
  subjects, or raw activity text.

### Error Copy Mapping

| Reporting denial reason | Message identifier         |
| ----------------------- | -------------------------- |
| `tenant_scope`          | `admin-crm:error.tenant`   |
| `role_scope`            | `admin-crm:error.role`     |
| `branch_scope`          | `admin-crm:error.branch`   |
| `agent_scope`           | `admin-crm:error.agent`    |
| `window_scope`          | `admin-crm:error.window`   |
| `unsupported_grouping`  | `admin-crm:error.grouping` |
| repository failure      | `admin-crm:error.generic`  |

## Per-Role Visibility

| Role             | CRM14 behavior                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `admin`          | May access `/admin/crm` and sees tenant-wide aggregate widgets.                                    |
| `staff`          | No `/admin/crm` access in this slice; staff reporting remains `P38-CRM15`.                         |
| `branch_manager` | No new admin-route access in this slice; branch-manager reporting requires a later scoped surface. |
| `agent`          | No access to `/admin/crm`; existing `/agent/crm` behavior remains CRM12-owned.                     |
| `member`         | No access.                                                                                         |

Peer leaderboard rows are out of scope for CRM14 because they need an explicit identity-label and
peer-comparison policy. CRM14 is aggregate-only.

Authorization is enforced in three layers:

1. Existing canonical-route authority gates the `/admin` route group.
2. The CRM14 route core re-checks the CRM reporting actor and permits only admin tenant aggregate
   access before any repository call. `branch_manager` remains denied for CRM14 even though the
   broader admin shell can host branch-manager routes.
3. CRM05 reporting authorization remains the final defense at the reporting repository/domain
   boundary.

## Acceptance Criteria

- `/admin/crm` renders for an authorized admin and exposes `admin-crm-page-ready`.
- The existing admin sidebar exposes a `/admin/crm` entry using the established admin sidebar
  pattern, and existing admin shell behavior remains unchanged.
- All CRM reporting data flows through CRM05 app-side repositories and domain read models.
- Route components do not contain ad hoc reporting SQL.
- The three in-scope widgets render with data, empty, and error-state proof.
- Source breakdown output is capped and sorted by the exported source-row constants.
- Live widgets use the exported 90-day default reporting window and do not accept query-param window
  overrides.
- Snapshot freshness follows the exported 24h/48h freshness thresholds.
- Multi-currency values remain grouped and displayed without conversion.
- Snapshot absence is a successful empty state, not a page failure.
- Reporting authorization failures fail closed before aggregate data is rendered.
- UI outputs remain PII-safe and aggregate-only.
- Existing `/admin`, `/admin/overview`, `/admin/leads`, `/agent/crm`, and staff routes keep their
  current clarity markers and behavior.

### Coverage Discipline

- Core tests must cover authorized admin access, denied non-admin roles, reporting denial mapping,
  empty snapshot rows, successful snapshot rows, snapshot freshness thresholds, source-row cap/sort,
  multi-currency rows, and PII-shape regression.
- Page/component tests must assert `admin-crm-page-ready` and all three widget markers.
- Locale coverage must include `sq`, `en`, `sr`, and `mk` for new admin CRM strings.
- The PII regression test must live at
  `apps/web/src/app/[locale]/admin/crm/_core.pii.test.ts` or an equivalently colocated
  `*.pii.test.ts` file, and must ensure output row keys do not include `email`, `phone`,
  `fullName`, `notes`, `description`, `subject`, or raw activity fields.
- Every `success | error` branch added by CRM14 needs a dedicated test.

## Risks And Open Questions

- **Scheduler boundary.** CRM13 is merged, so CRM14 can consume generated snapshot rows; CRM14 must
  not change scheduler behavior or snapshot generation semantics.
- **Admin route introduction.** `/admin/crm` is allowed because it lives under the canonical `/admin`
  route group, but proxy/routing authority remains read-only.
- **Identity labels.** Branch/pipeline labels may require existing safe labels. CRM14 must avoid new
  PII joins and may display stable branch/pipeline identifiers if safe labels are unavailable.
- **Performance.** First-slice target is `< 500 ms` p95 per widget against seeded/local data. Broader
  reporting performance work remains a later gate. The CRM14 budget is measured from local seeded
  route-core tests or Playwright traces and is not CI-blocking in this gate.
- **Admin shell side effects.** Adding the mandatory sidebar item touches the admin shell surface; the
  change must preserve existing admin sidebar behavior, admin route markers, and tenant-context query
  propagation.
- **No charts.** Charting is deferred to avoid bundle-size, visual-regression, and chart-accessibility
  scope in the first admin slice.
- **DB access baseline.** CRM14 is expected to reuse CRM05 reporting adapters without adding new SQL.
  `pnpm check:db-access` is still required; any new tenant-scoped SQL requires an explicit baseline
  update in the implementation PR.

## Dependency / Sequencing

CRM14 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM12 Reporting Dashboard UI`.
- `P38-CRM13 Forecast Snapshot Scheduler`, complete through PR `#759`.

CRM14 should land before:

- `P38-CRM15 Staff Reporting Dashboard UI`.
- `P38-CRM20 Admin Reporting Branch-Manager Surface`.
- `P38-CRM16 Reporting Charting Foundation`.
- Snapshot observability/backfill UI that assumes an admin reporting surface.

CRM14 is independent of routing persistence (`P38-CRM08`), routing admin UX (`P38-CRM09`), legacy
deal column retirement (`P38-CRM10`), and CRM04 nullability tightening (`P38-CRM11`).

## Non-Goals

- `/staff/crm` or branch-manager reporting UI.
- Agent CRM reporting changes beyond preserving CRM12 behavior.
- Leaderboards, peer-by-name comparisons, funnel charts, velocity charts, or visual-regression
  baselines.
- Admin reporting date-window query overrides.
- New charting dependencies or bundle-size budget changes.
- Forecast snapshot scheduler changes, run-ledger persistence, historical backfill, or observability
  integrations.
- CRM schema/migrations, RLS changes, routing persistence, routing admin UX, legacy deal cleanup, or
  nullability tightening.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS.md, or broad
  architecture-doc changes.

## Verification Plan

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/admin/crm'`
- `pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting/index.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm i18n:check` verifies locale key parity and interpolation consistency.
- `pnpm i18n:purity:check` verifies localized message files do not leak disallowed source-language
  text.
- `pnpm check:db-access`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify` verifies Phase C documentation locks remain intact.
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `interdomestik_qa.scope_audit` with docs plus explicitly authorized admin CRM reporting paths.

## Promotion Boundary

This gate opens `P38-CRM14 Admin Reporting Dashboard UI` only. It does not authorize staff reporting
UI, charting, schema changes, scheduler changes, run-ledger persistence, backfill, observability,
routing persistence, cleanup/tightening gates, proxy edits, canonical route changes, or auth/tenancy
architecture changes.

## Promotion / Sign-Off

| Slice                                                    | Status   | Authority            | Notes                                                       |
| -------------------------------------------------------- | -------- | -------------------- | ----------------------------------------------------------- |
| `P38-CRM06 Lead Dedupe Domain Foundation`                | complete | PR `#750`            | Merge commit `c7412618c9f55adf85a75d8f06d7b5de51961254`.    |
| `P38-CRM07 Lead Routing Domain Foundation`               | complete | PR `#751`            | Merge commit `dce513248cee825ae5e7d616f17c489a80422a1e`.    |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete | PR `#756`            | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.    |
| `P38-CRM12 Reporting Dashboard UI`                       | complete | PR `#757`            | Merge commit `3a220ea88eb0c2b765b56d3d926edd21952b3def`.    |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | complete | PR `#759`            | Merge commit `5544ffdea752031086a5bf5cda8b5892af6e3a83`.    |
| `P38-DG10 Admin Reporting Dashboard UI Design Review`    | complete | tracker/program gate | Promotes exactly one bounded admin dashboard UI slice.      |
| `P38-CRM14 Admin Reporting Dashboard UI`                 | promoted | `P38-DG10`           | Admin aggregate reporting UI only.                          |
| `P38-CRM15 Staff Reporting Dashboard UI`                 | reserved | post-admin           | Staff/branch reporting UI remains deferred.                 |
| `P38-CRM16 Reporting Charting Foundation`                | reserved | later gate           | Charting dependency and bundle-size policy remain deferred. |
| `P38-CRM17 Forecast Snapshot Backfill`                   | reserved | later gate           | Historical backfill and operator runbook remain deferred.   |
| `P38-CRM18 Forecast Snapshot Observability`              | reserved | later gate           | Alerting and run telemetry dashboards remain deferred.      |
| `P38-CRM19 Forecast Snapshot Backfill Operator UX`       | reserved | post-backfill        | Operator-facing backfill controls remain deferred.          |
| `P38-CRM20 Admin Reporting Branch-Manager Surface`       | reserved | post-admin           | Branch-manager reporting surface remains deferred.          |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | future gate          | Still valid, but not selected ahead of admin reporting.     |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing         | Requires routing persistence first.                         |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | later gate           | Requires normalized-reader confidence and retirement proof. |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate           | Requires production zero-null evidence.                     |
