# P38-DG08 Post-CRM05 Closeout And Next Slice Selection

Status: complete
Slice: `P38-DG08`
Date: 2026-05-14
Authority: this gate opens `P38-CRM12 Reporting Dashboard UI` only.
Promoted implementation slice: `P38-CRM12 Reporting Dashboard UI`

## Status / Predecessor Closeout

`P38-CRM05 Reporting Read-Models And Forecast Snapshots` is complete through PR `#756`,
merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.

CRM05 added:

- `packages/domain-crm/src/reporting` with deterministic SQL-free derivations.
- App-side reporting and snapshot repositories.
- Additive append-only `crm_pipeline_snapshots` persistence.
- PII-shape regression and deterministic aggregation proof.
- Remote proof with SonarCloud, Copilot/pr-finalizer, Pilot Gate, unit, and E2E green.

`P38-DG07` reserved `P38-CRM12 Reporting Dashboard UI` and
`P38-CRM13 Forecast Snapshot Scheduler` after CRM05. CRM05 is now sufficient for a bounded first
dashboard-consumption slice.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM12 Reporting Dashboard UI`

CRM05 created the read-model and adapter foundation specifically so dashboard surfaces can stop being
counter-only and start showing credible pipeline and source-health signals. The first UI slice must
consume the CRM05 boundary on the existing `/agent/crm` surface before scheduled snapshot generation,
routing persistence, admin/staff CRM reporting, charting, or cleanup gates.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                                                               |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM12 Reporting Dashboard UI`                 | Promote now. It is the direct user-visible unlock from CRM05 and validates the read-model contracts against real dashboard ergonomics. |
| 2    | `P38-CRM13 Forecast Snapshot Scheduler`            | Defer. Useful after dashboards exist; CRM05 already provides manual/adapter snapshot persistence without cron behavior.                |
| 3    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Routing remains important, but dashboard professionalism now has the data foundation it was waiting for.                        |
| 4    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires more reader confidence and explicit retirement proof.                                                                  |
| 5    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                                                                 |

## Implementation Scope For P38-CRM12

Allowed:

- Existing `/agent/crm` dashboard surface only.
- Co-located `/agent/crm` server/read-model wrappers.
- Existing app-side `domain-crm` reporting repository consumption.
- Existing `agent` locale messages and focused page/core tests.
- Focused route/component proof that preserves `agent-crm-page-ready`.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- Admin CRM, staff CRM, or branch-manager CRM reporting UI.
- New CRM schema/migrations, scheduled jobs, cron workers, snapshot generation automation, routing
  persistence, routing admin UX, legacy deal column retirement, CRM04 nullability tightening, Stripe,
  README, AGENTS.md, or broad architecture docs.

## Widgets In Scope

CRM12 ships exactly three chart-free widgets:

1. **Weighted pipeline by currency** using `deriveCrmWeightedPipeline`.
2. **Source breakdown** using `deriveCrmSourceBreakdown`.
3. **Win rate by source** using `deriveCrmWinRate`.

Out of this first UI slice:

- Funnel conversion UI.
- Stage velocity UI.
- Agent leaderboard UI.
- Forecast snapshot UI.
- Charts or new charting dependencies.

## Widget Contract

- The first slice is SSR-only for reporting widgets. No loading spinner or skeleton is required
  because the page resolves server-side before `agent-crm-page-ready` is emitted.
- Empty states are rendered per widget when the CRM05 report returns no rows.
- Access-denial reasons from CRM05 map to fail-closed page behavior, matching the existing agent CRM
  dashboard denial posture.
- Currency values display as locale-formatted decimal amounts with an ISO currency-code suffix, not
  currency symbols.
- Multi-currency output appears as separate currency rows/cards inside the same widget.
- CRM05 exclusion counters are shown as small muted metadata in the weighted-pipeline widget when
  non-zero.
- Every widget exposes a stable `data-testid`:
  - `agent-crm-reporting-weighted-pipeline`
  - `agent-crm-reporting-source-breakdown`
  - `agent-crm-reporting-win-rate`
- The existing `agent-crm-page-ready` marker remains the outer page-ready marker and is emitted only
  by the resolved server-rendered page.
- Locale coverage must match the existing `agent` message locale set: `en`, `mk`, `sq`, and `sr`.
- Minimum accessibility bar: semantic headings, readable table/list structure, keyboard-compatible
  links/buttons inherited from existing components, and no color-only meaning.

## Per-Role Visibility

| Role             | CRM12 behavior                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `agent`          | Sees own weighted pipeline, source breakdown, and win-rate-by-source on `/agent/crm`.             |
| `branch_manager` | Out of scope. Branch CRM reporting UI is reserved for a later staff/admin/branch dashboard slice. |
| `staff`          | Out of scope. Staff CRM reporting UI is reserved for `P38-CRM15 Staff Reporting Dashboard UI`.    |
| `admin`          | Out of scope. Admin CRM reporting UI is reserved for `P38-CRM14 Admin Reporting Dashboard UI`.    |
| `member`         | No access; unchanged.                                                                             |

## Acceptance Criteria

- `/agent/crm` renders the three CRM12 reporting widgets for an authorized agent.
- Dashboard reporting data is loaded only through the CRM05 reporting repository/domain read-model
  boundary, not ad hoc SQL in the route component.
- The legacy stats and due-follow-up sections remain behavior-compatible.
- Empty reporting states render per widget.
- Weighted pipeline presents multi-currency metrics without conversion and includes non-zero
  exclusion counters.
- Widget output does not expose email, phone, notes, raw activity descriptions, or unrelated
  lead/contact names.
- `agent-crm-page-ready` and all three widget test markers are present.
- `en`, `mk`, `sq`, and `sr` message bundles contain all new CRM12 keys.

### Coverage Discipline

- Core tests must prove reporting repository calls use the authenticated `CrmActorContext`, a bounded
  reporting window, and the selected CRM05 derivations.
- Page tests must prove authorized rendering, widget markers, and at least one empty-state path.
- Authorization failure tests must remain fail-closed before any reporting data is shown.
- Focused tests must cover multi-currency formatting and non-zero exclusion metadata.

## Risks And Open Questions

- **Dashboard density.** The first slice may feel more operational than visual because charts are
  intentionally deferred to avoid adding or expanding chart dependencies.
- **Raw pipeline/stage naming.** CRM05 reports are aggregate-first and do not yet guarantee display
  names for every pipeline/stage; CRM12 avoids stage/funnel/velocity widgets until a later UI gate
  pins display-name projections.
- **Performance.** CRM12 does not introduce a new SLO gate. Existing CRM05 adapter queries and PR
  gates are the performance proof for the first slice; a later reporting-scale gate can add budgets.
- **Peer comparison.** Agents do not see peer leaderboards in this slice because CRM05 explicitly
  denies agent leaderboard reads.

## Dependency / Sequencing

CRM12 depends on CRM05 reporting read models and must land before:

- `P38-CRM13 Forecast Snapshot Scheduler`, so scheduled snapshots have a visible consumer.
- `P38-CRM14 Admin Reporting Dashboard UI`, so admin reporting can reuse proven widget patterns.
- `P38-CRM15 Staff Reporting Dashboard UI`, so staff reporting can reuse proven widget patterns.
- Any charting-foundation slice, so charting is added only after useful chart-free metrics are
  proven on the live surface.

## Non-Goals

- Admin, staff, or branch-manager CRM dashboard UI.
- Charts, chart-library changes, visual regression screenshot baselines, or bundle-size work.
- Forecast snapshot scheduler, cron, or worker behavior.
- New reporting schema, migrations, or backfills.
- Routing persistence or routing admin UX.
- Legacy deal column retirement or CRM04 nullability tightening.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS.md, or broad
  architecture-doc changes.

## Verification Plan

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(agent)/agent/crm'`
- `pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting/index.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm check:db-access`
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `interdomestik_qa.scope_audit` with docs plus explicitly authorized CRM dashboard/reporting paths.

## Promotion Boundary

Merging this gate authorizes `P38-CRM12 Reporting Dashboard UI` only. It does not authorize dashboard
work outside `/agent/crm`, charting, admin/staff reporting, scheduler work, routing persistence, or
cleanup/tightening gates.

## Promotion / Sign-Off

| Slice                                                    | Status   | Authority                | Notes                                                                |
| -------------------------------------------------------- | -------- | ------------------------ | -------------------------------------------------------------------- |
| `P38-CRM06 Lead Dedupe Domain Foundation`                | complete | PR `#750`                | Merge commit `c7412618c9f55adf85a75d8f06d7b5de51961254`.             |
| `P38-CRM07 Lead Routing Domain Foundation`               | complete | PR `#751`                | Merge commit `dce513248cee825ae5e7d616f17c489a80422a1e`.             |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete | PR `#756`                | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.             |
| `P38-CRM12 Reporting Dashboard UI`                       | promoted | `P38-DG08`               | `/agent/crm` chart-free reporting widgets only.                      |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | reserved | post-dashboard           | Cron/worker snapshot generation remains deferred.                    |
| `P38-CRM14 Admin Reporting Dashboard UI`                 | reserved | later gate               | Admin aggregate reporting UI remains deferred.                       |
| `P38-CRM15 Staff Reporting Dashboard UI`                 | reserved | later gate               | Staff/branch reporting UI remains deferred.                          |
| `P38-CRM16 Reporting Charting Foundation`                | reserved | later gate               | Charting dependency and bundle-size policy remain deferred.          |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | future gate              | Still valid, but not selected ahead of CRM reporting UI.             |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing-persistence | Requires routing persistence first.                                  |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | later gate               | Requires normalized-reader confidence and explicit retirement proof. |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate               | Requires production zero-null evidence.                              |
