# P38-DG13 Admin Reporting Branch-Manager Surface Design Review

Status: complete
Slice: `P38-DG13`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-15
Authority: this gate opens `P38-CRM20 Admin Reporting Branch-Manager Surface` only.
Recommended implementation slice: `P38-CRM20 Admin Reporting Branch-Manager Surface`
Promoted implementation slice: `P38-CRM20 Admin Reporting Branch-Manager Surface`

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice.

## Status / Predecessor Closeout

`P38-CRM16 Reporting Charting Foundation` is complete through PR `#767`, merge commit
`c73ab4a8df98bdd6237110bbb7fb466634839ca9`. The merged slice completed the reporting
charting tranche after CRM12, CRM14, and CRM15 by adding supplemental CRM reporting charts while
keeping table and metric-band content authoritative.

The final CRM16 implementation preserved the DG12 accessibility and marker contract, kept charts as
progressive enhancement, preserved existing page-ready markers, avoided chart dependency changes,
and held the affected route chunks within the existing build-size proof path. The implementation
used native SVG chart rendering to satisfy the bundle budget while keeping the existing installed
chart dependency unchanged and out of CRM reporting chunks.

External Notion sync for CRM16 closeout is pending because the Notion connector token expired during
post-merge sync. CRM20 implementation may proceed before Notion sync is restored because the repo
merge proof is canonical; the implementation closeout must report the Notion blocker if it remains.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM20 Admin Reporting Branch-Manager Surface`

CRM12, CRM14, CRM15, and CRM16 now provide stable reporting consumption and supplemental chart
discipline across agent, admin, and staff CRM surfaces. The next useful slice is the branch-manager
reporting surface that earlier gates deliberately deferred. Existing code already admits
`branch_manager` into the canonical `/admin` shell, while `/admin/crm` and the admin sidebar CRM item
intentionally deny branch managers today. CRM20 should change only that CRM reporting surface
behavior, and only for branch-scoped branch-manager sessions.

DG13 approval permits the implementation PR to update `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, and proof metadata for `P38-DG13` / `P38-CRM20`.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                     |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM20 Admin Reporting Branch-Manager Surface` | Recommend for review. Branch-manager reporting is the deferred access contract after charts. |
| 2    | `P38-CRM18 Forecast Snapshot Observability`        | Defer. Useful next, but branch-manager reporting should settle visibility before ops charts. |
| 3    | `P38-CRM17 Forecast Snapshot Backfill`             | Defer. Historical backfill should follow live reporting access and observability decisions.  |
| 4    | `P38-CRM21 Visual Regression Baseline`             | Defer. Valuable after one more role surface proves the chart/display contract.               |
| 5    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Still valid, but independent from the current reporting access sequence.              |
| 6    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires routing persistence first.                                                   |
| 7    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                  |
| 8    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                       |

## Implementation Scope For P38-CRM20

Allowed:

- Branch-manager access to the existing canonical `/admin/crm` reporting route only.
- A branch-manager branch-scoped reporting core or a narrowly factored admin/branch-manager core
  under the existing `/admin/crm` route boundary.
- CRM05 reporting repository/domain read-model consumption through the existing app-side
  `domain-crm` boundary.
- Branch-scoped versions of the existing admin CRM reporting widgets: latest forecast snapshot,
  branch pipeline, and source breakdown.
- Supplemental CRM16 chart rendering over the branch pipeline rows only when branch-scoped table data
  is present. The table remains the source of truth.
- Admin-sidebar `/admin/crm` discoverability for branch-manager sessions with a non-null branch
  scope, while preserving existing admin/super-admin/tenant-admin visibility.
- Localized branch-manager-safe copy for the existing web locale set: `sq`, `en`, `sr`, and `mk`.
- Focused route-core, page/component, sidebar, i18n, chart-marker, and PII regression tests.
- Program/tracker updates for the promoted slice and implementation proof.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- `/agent/crm`, `/staff/crm`, member UI, staff support-handoff flows, staff claims flows, or
  unrelated admin pages.
- Schema/migrations, RLS policies, CRM reporting SQL shape changes, forecast snapshot table shape,
  run-ledger persistence, backfills, scheduler behavior, or observability integrations.
- New chart dependencies, broad dashboard redesign, or visual-regression baseline infrastructure.
- Routing persistence, routing admin UX, legacy deal column retirement, CRM04 nullability
  tightening, Stripe, README, AGENTS.md, or broad architecture docs.

## Route And Authorization Contract

CRM20 uses `/admin/crm` because the canonical admin shell already permits `branch_manager` through
the existing route authority. CRM20 must not add a new branch-manager route, rename `/admin`, or
change proxy behavior.

Authorization is enforced in four layers:

1. Existing canonical route authority admits only roles already allowed into the `/admin` shell.
2. `/admin/crm` validates session tenant, actor ID, role, and branch-manager branch scope before
   constructing any CRM actor.
3. `/admin/crm` session-to-actor mapping keeps `admin`, `tenant_admin`, and `super_admin` sessions
   mapped to the CRM `admin` actor, but maps `branch_manager` sessions with branch scope to a CRM
   `branch_manager` actor with `scope.branchId = session.user.branchId`.
4. `/admin/crm` fails closed before repository reads when a branch-manager session has no tenant,
   actor ID, or branch ID. The implementation must not construct
   `{ role: 'branch_manager', scope: { branchId: undefined } }` and rely on CRM05 to deny it.
5. CRM05 `authorizeCrmReportingRead` remains the final domain boundary. A branch-manager actor
   without branch scope must produce `branch_scope`.

The current CRM14/CRM16 admin behavior must remain intact: `admin`, `tenant_admin`, and
`super_admin` sessions continue to receive tenant-wide `/admin/crm` reporting through the existing
admin actor mapping. Branch managers must never be mapped to the CRM `admin` actor.

### Route Core Split

The `/admin/crm` route entry dispatches to one of two separate cores after actor resolution:

- `adminCrmReportingCore` for CRM `admin` actors and existing CRM14/CRM16 output shapes.
- `branchManagerCrmReportingCore` for CRM `branch_manager` actors and CRM20 output shapes.

The implementation must not thread `if (role === 'branch_manager')` branches through every existing
admin widget. Branch-manager widgets, typed output shapes, and PII tests live separately from the
existing admin core, even if they reuse small pure formatting or freshness helpers.

## Branch Scope Rules

- Branch-manager reporting is limited to the session branch only.
- Rows with another `branchId` are excluded before rendering.
- Rows with `branchId === null` are excluded for branch managers in CRM20. No tenant-wide or
  unassigned aggregate should be shown to branch managers unless a later design explicitly defines
  that policy.
- If the previous UTC day has no branch snapshot rows but has tenant-wide snapshot rows with
  `branchId === null`, the branch-manager snapshot widget renders empty. It must not fall back to
  tenant-wide snapshot data.
- Snapshot freshness computes from the most recent branch row only. Absence of branch rows renders
  empty, never stale.
- The branch-scoped output may include the branch ID and a safe branch label. It must not include
  staff, agent, member, lead, contact, or deal-level labels.
- Repository failures and reporting denials render localized branch-manager-safe error copy and must
  not expose raw SQL, adapter details, or denial internals in the UI.

## Widget Contract

CRM20 ships exactly three branch-scoped widgets on `/admin/crm` for branch-manager sessions:

1. **Latest forecast snapshot.** Shows previous-day branch snapshot rows for the manager's branch
   only. Uses CRM14 snapshot freshness thresholds and omits tenant-wide/null-branch snapshot rows.
2. **Branch pipeline.** Shows live weighted pipeline rows for the manager's branch only. Uses CRM14
   branch-pipeline amount semantics and may render the existing CRM16 pipeline amount chart over the
   same rows.
3. **Source breakdown.** Shows CRM05 source breakdown rows filtered to the manager's branch. Uses
   CRM14 source top-N semantics and safe source fallback rules.

No funnel movement, stage velocity, leaderboards, peer comparisons, branch comparisons, drilldowns,
or row-level CRM records are authorized by CRM20.

### Exported Constants

CRM20 should export these constants from the admin CRM route core or a colocated branch-manager CRM
core:

```ts
export const BRANCH_MANAGER_CRM_REPORTING_WINDOW_DAYS = 90;
export const BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N = 10;
export const BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX = 'branch-manager-crm-reporting-';
export const BRANCH_MANAGER_CRM_SNAPSHOT_DELAYED_AFTER_HOURS = 24;
export const BRANCH_MANAGER_CRM_SNAPSHOT_STALE_AFTER_HOURS = 48;
```

The constants intentionally mirror CRM14 where the semantics are shared. Tests should import the
constants rather than duplicating literal values.

All three branch-manager widgets share one frozen reporting window. The route core computes
`{ from, to }` exactly once at entry using `BRANCH_MANAGER_CRM_REPORTING_WINDOW_DAYS`, then passes
that same window object to snapshot, pipeline, and source reads in the same render pass.

### Output Shapes

CRM20 route-core output must expose typed, aggregate-only projections for branch-manager rendering
and PII regression tests:

```ts
export interface BranchManagerCrmSnapshotRow {
  snapshotDate: string;
  snapshotVersion: number;
  branchId: string;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  closedWonAmountMinor: number;
  closedLostAmountMinor: number;
  freshness: AdminCrmSnapshotFreshness;
}

export interface BranchManagerCrmPipelineRow {
  branchId: string;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  excludedInconsistentForecastCount: number;
}

export interface BranchManagerCrmSourceBreakdownRow {
  branchId: string;
  branchLabel: string;
  sourceLabel: string;
  currencyCode: string;
  dealCount: number;
  totalAmountMinor: number;
  weightedAmountMinor: number;
  excludedInconsistentForecastCount: number;
}
```

`AdminCrmSnapshotFreshness` comes from the CRM14 admin CRM core export; CRM20 must reuse that type
rather than creating a parallel freshness enum. `branchLabel` is non-nullable because the
branch-manager route core owns fallback: when no friendly label is available from an authorized
context, it sets `branchLabel` to the branch ID string before data reaches renderers.

These shapes must not contain lead/contact/member names, staff or agent names, email, phone, notes,
descriptions, subjects, activity text, claim text, deal names, or row-level CRM identifiers outside
aggregate-safe branch/pipeline/source/currency IDs.

## Marker Rules

- Admin-like sessions keep the existing `admin-crm-page-ready` root marker and existing
  `admin-crm-reporting-*` widget markers.
- Branch-manager sessions on `/admin/crm` expose the existing `admin-crm-page-ready` root marker for
  route continuity.
- Branch-manager widget markers are derived from
  `BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX`:
  `${BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX}snapshot`,
  `${BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX}branch-pipeline`, and
  `${BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX}source-breakdown`.
- If the branch pipeline chart renders, it uses the existing CRM16
  `crm-reporting-chart-pipeline-amount` marker. No new chart marker prefix is authorized.
- Page-ready semantics do not wait for client-only chart paint. The table/metric content, empty
  state, or fail-closed error state is sufficient for readiness.

## State And Formatting Rules

- Empty state: each branch-manager widget remains visible with localized branch-safe empty copy.
- Error state: branch-manager reporting denials and repository failures fail closed with localized
  copy. Raw denial reasons stay server-side and PII-free.
- Currency: display full localized numbers with ISO currency code suffix. No compact K/M
  abbreviations and no currency conversion.
- Multi-currency: render stacked rows grouped by ISO code, matching CRM14/CRM15/CRM16 discipline.
- Freshness: snapshot freshness uses the CRM14 delayed/stale thresholds.
- Source labels: use existing CRM14 source fallback semantics. `unknown` is localized before render.
- Source top-N sorting is deal count descending, then total amount descending, then source label
  ascending, then currency code ascending before applying `BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N`.
- Branch labels: use a safe branch label only when already available from authorized branch context;
  otherwise use the stable branch ID fallback.
- Snapshot version: branch-manager UI should not expose the raw snapshot version as primary visible
  text. If it is shown, it must appear only as supporting tooltip/status metadata with localized copy
  explaining that it identifies the generated snapshot revision.
- Charts: charts are supplemental, render only when `rows.length > 0`, are omitted for empty data,
  and are never the only accessible representation.

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

## Sidebar Visibility

The admin sidebar CRM item remains visible for `super_admin`, `tenant_admin`, and `admin`.

CRM20 additionally shows `/admin/crm` to `branch_manager` users only when the sidebar receives a
non-null `branchId` for the current session. The maximum allowed sidebar plumbing is:

- The admin layout passes `branchId?: string | null` through the existing sidebar user prop.
- The sidebar component reads that prop to conditionally render the CRM item for `branch_manager`.
- No new auth helpers, context providers, route changes, or proxy changes.

Branch-manager sessions without branch scope must not see the CRM sidebar item and must still fail
closed on direct `/admin/crm` access.

The staff sidebar remains unchanged: `/staff/crm` stays staff-role only and remains hidden from
branch managers.

## Acceptance Criteria

- Branch managers with tenant and branch scope can access `/admin/crm`.
- Branch managers without branch scope, tenant scope, or actor ID fail closed before repository
  reads.
- Admin-like `/admin/crm` behavior and existing admin markers remain unchanged.
- Branch-manager reporting uses CRM `branch_manager` actor context, not the CRM `admin` actor.
- CRM05 `authorizeCrmReportingRead` returns `branch_scope` for a branch-manager actor without branch
  scope and success for a branch-manager actor with branch scope.
- Branch-manager snapshot, pipeline, and source widgets contain only the manager's branch rows.
- Null-branch and other-branch rows do not render for branch managers.
- Empty branch snapshot plus non-empty tenant-wide snapshot renders branch-manager snapshot empty.
- The branch-manager admin-sidebar CRM item is visible only for branch-scoped branch-manager
  sessions, while existing admin-like visibility remains unchanged.
- The staff sidebar still hides `/staff/crm` from branch managers.
- Chart rendering, if present, uses existing CRM16 components and remains supplemental.
- Output shapes and rendered labels remain aggregate-only and PII-safe.
- `sq`, `en`, `sr`, and `mk` locales are complete and pure.
- E2E proof includes one admin-session smoke and one branch-manager-session smoke against
  `/admin/crm` so either actor path can fail CI.

## Coverage Discipline

- Route-core tests cover admin-like unchanged behavior, branch-manager branch-scoped access,
  branch-manager missing-branch denial, branch filtering for live rows, branch filtering for snapshot
  rows, empty states, repository failures, and denial mapping.
- Domain reporting tests cover the exact CRM05 branch-manager authorization behavior:
  branchless branch-manager actors receive `branch_scope`; branch-scoped branch-manager actors are
  authorized for reporting reads.
- Page/component tests cover branch-manager `/admin/crm` rendering, root marker continuity,
  branch-manager widget markers, chart marker behavior, and fail-closed direct access.
- Sidebar tests cover admin-like CRM visibility, branch-manager with branch visibility,
  branch-manager without branch hidden visibility, and non-admin/non-branch-manager hidden
  visibility where applicable.
- PII tests cover branch-manager output keys and rendered labels.
- i18n tests cover all branch-manager-specific additions for `sq`, `en`, `sr`, and `mk`.
- DB-access guard proof must show CRM20 does not introduce new DB access outside the existing
  app-side `domain-crm` reporting boundary.
- Scope audit must allow only the implementation paths needed for `/admin/crm`, admin sidebar, CRM
  chart reuse if touched, locale files, focused tests, and plan/tracker proof.

## Risks And Open Questions

- **Actor mapping regression.** The highest-risk bug is accidentally mapping branch managers to the
  CRM `admin` actor. Tests must assert the exact actor passed to the core/repository path.
- **Snapshot filtering.** If the snapshot repository returns tenant-wide rows, branch-manager
  filtering must happen before rendering and before chart projection.
- **Sidebar branch scope.** The admin sidebar may need the layout to pass `branchId` into the user
  prop. This is allowed only as a focused visibility input, not an auth refactor.
- **Branch label source.** If a friendly branch display name is not already available from an
  authorized context, CRM20 should use the branch ID fallback rather than add a new branch lookup.
- **Chart accessibility.** CRM16 chart rules still apply. If chart rows cannot be projected from the
  branch-safe table rows, omit the chart.
- **Observability sequencing.** Forecast observability remains valuable, but CRM20 should not add
  run-ledger, scheduler, or alerting behavior.

## Dependency / Sequencing

CRM20 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM14 Admin Reporting Dashboard UI`.
- `P38-CRM16 Reporting Charting Foundation`.

CRM20 should land before:

- `P38-CRM18 Forecast Snapshot Observability`, if observability views need branch-manager reporting
  expectations.
- `P38-CRM17 Forecast Snapshot Backfill`, if backfill proof is later rendered on branch-scoped
  reporting surfaces.
- `P38-CRM21 Visual Regression Baseline`, if visual proof should cover branch-manager reporting.

CRM20 is independent of routing persistence (`P38-CRM08`), routing admin UX (`P38-CRM09`), legacy
deal column retirement (`P38-CRM10`), and CRM04 nullability tightening (`P38-CRM11`).

## Non-Goals

- No proxy edit.
- No canonical route rename.
- No new `/branch-manager` route.
- No `/staff/crm` branch-manager access.
- No `/agent/crm` or member UI change.
- No new reporting SQL, schema, migration, RLS, or snapshot table changes.
- No scheduler, backfill, run-ledger, or observability behavior.
- No branch comparison, peer comparison, leaderboard, drilldown, or row-level CRM record UI.
- No chart dependency change, visual-regression infrastructure, or broad dashboard redesign.
- No Stripe, README, AGENTS.md, or broad architecture docs.

## Verification Plan

The DG13 design-draft phase requires only docs-focused proof: `pnpm plan:audit`,
`pnpm track:audit`, `pnpm docs:verify`, `git diff --check`, and reviewer approval.

The commands below run for the future CRM20 implementation PR, not for the original review draft.

Focused commands:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/admin/crm/_core.test.ts' 'src/app/[locale]/admin/crm/_core.pii.test.ts' 'src/app/[locale]/admin/crm/_branch-manager-core.test.ts' 'src/app/[locale]/admin/crm/_branch-manager-core.pii.test.ts' 'src/app/[locale]/admin/crm/page.test.tsx'
pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting/index.test.ts
pnpm --filter @interdomestik/web test:unit --run src/components/admin/admin-sidebar.test.tsx src/components/staff/staff-sidebar.test.tsx
pnpm --filter @interdomestik/web test:e2e -- --project=gate-ks-sq e2e/gate/admin-crm-reporting.spec.ts
pnpm --filter @interdomestik/web lint -- 'src/app/[locale]/admin/crm' src/components/admin/admin-sidebar.tsx src/components/admin/admin-sidebar.test.tsx src/components/staff/staff-sidebar.tsx src/components/staff/staff-sidebar.test.tsx src/i18n/messages.ts
pnpm --filter @interdomestik/web type-check
pnpm check:db-access
pnpm i18n:check
pnpm i18n:purity:check
```

Required pre-PR commands:

```bash
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm check:db-access
pnpm i18n:check
pnpm i18n:purity:check
git diff --check
pnpm verify-slice -- --static
```

Run `interdomestik_qa.scope_audit` with allowed implementation paths only before opening the PR.
Then run the standard PR gates required by AGENTS.md before merge:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

## Promotion Boundary

This gate promotes CRM20 after review, but the promotion portion is docs-only. Runtime
implementation lands in the CRM20 implementation PR and must not be mixed with unrelated promotion
or closeout work.

The implementation PR may proceed before Notion sync is restored. If Notion remains blocked at
closeout, the final report must record the connector blocker and stale external-tracker risk.

The CRM20 implementation PR must not include proxy edits, canonical route changes, auth/tenancy
architecture changes, schema/migration work, or unrelated dashboard refactors. The eventual sign-off
table should record `P38-CRM20` as completed, preserve `P38-CRM17`/`P38-CRM18`/`P38-CRM21` and the
routing/cleanup gates as deferred or reserved, and include a one-line CRM06/CRM07 audit-chain
footnote if the broader P38 table is refreshed.

## Review Questions

1. Should CRM20 include all three existing admin widgets for branch managers, or should the snapshot
   widget remain admin-only until observability/backfill work lands? Author recommendation: include
   all three widgets for consistency with the existing admin reporting surface.
2. Should branch-manager-friendly branch labels be allowed only when already present in session or
   authorized layout context, with branch ID fallback otherwise? Author recommendation: yes.
3. Should the branch-manager sidebar link be hidden when branch scope is missing, or shown and left
   to the page-level fail-closed behavior? Author recommendation: hide when branch scope is missing
   and keep page-level fail-closed behavior as defense in depth.
