# P38-DG12 Reporting Charting Foundation Design Review

Status: complete
Slice: `P38-DG12`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-15
Authority: this gate opens `P38-CRM16 Reporting Charting Foundation` only.
Promoted implementation slice: `P38-CRM16 Reporting Charting Foundation`

## Status / Predecessor Closeout

`P38-CRM15 Staff Reporting Dashboard UI` is complete through PR `#764`, merge commit
`7315b1b1548abb156f91a16cdb0a1dce7c863bff`, with closeout sync through PR `#765`, merge commit
`c418995ce21b68940362cb295abf62545b48c96e`. The merged slice adds:

- Chart-free `/staff/crm` operational reporting UI for staff-role users only.
- Pipeline workload, funnel movement, and stage velocity widgets consuming CRM05 reporting
  repositories/domain read-models through the existing app-side `domain-crm` boundary.
- `staff-crm-page-ready` plus derived `staff-crm-reporting-*` widget markers.
- Staff-sidebar `/staff/crm` discoverability gated to staff users only.
- PII-safe aggregate output, multi-currency stacked rows without conversion, label/no-branch
  fallback, denial mapping, and deterministic sort/cap semantics.
- Copilot hardening for staff pipeline top-10 selection after workload aggregation.
- Remote proof for SonarCloud, Copilot/pr-finalizer, audit, unit, static, PR E2E, e2e-gate, Pilot
  Gate Preflight/Runner, pilot-gate, commitlint, gitleaks, pnpm-audit, and validation-surface.
- Notion sync recorded under `PR 764 P38 CRM15 Staff Reporting Dashboard UI`.

DG12 therefore closes the chart-free agent/admin/staff reporting dashboard tranche and promotes the
first bounded charting foundation slice.

CRM12 and CRM14 completed the agent and admin chart-free reporting surfaces earlier in this tranche;
CRM15 closeout above closes the staff surface and makes the agent/admin/staff chart-free contract
ready for a shared charting foundation.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM16 Reporting Charting Foundation`

CRM12, CRM14, and CRM15 now expose stable chart-free reporting contracts across agent, admin, and
staff CRM surfaces. The repo already has `recharts` in `apps/web/package.json`, so CRM16 should not
add another charting dependency. The useful next step is to standardize how CRM reporting charts are
rendered, tested, localized, and made accessible before later branch-manager reporting, backfill,
observability, or historical trend work starts introducing one-off chart patterns.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                         |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | `P38-CRM16 Reporting Charting Foundation`          | Promote now. Chart-free reporting contracts are stable enough to add a shared chart discipline.  |
| 2    | `P38-CRM20 Admin Reporting Branch-Manager Surface` | Defer. Branch-manager reporting needs its own authorization/visibility contract after charts.    |
| 3    | `P38-CRM18 Forecast Snapshot Observability`        | Defer. Scheduler observability is useful but should reuse the charting/accessibility discipline. |
| 4    | `P38-CRM17 Forecast Snapshot Backfill`             | Defer. Historical backfill should follow live UI, scheduler, and chart-display proof.            |
| 5    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Still valid, but independent from the reporting UI/charting sequence in flight.           |
| 6    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires routing persistence first.                                                       |
| 7    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                      |
| 8    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                           |

## Implementation Scope For P38-CRM16

Allowed:

- A shared CRM reporting chart foundation under `apps/web/src/components/crm` or an equivalent
  existing app-side component boundary.
- Use of the already-installed `recharts` package only. CRM16 must not add a new charting
  dependency or change the current `apps/web/package.json` version constraint, `^3.8.1`.
- Supplemental chart renderers for the existing CRM12/CRM14/CRM15 aggregate reporting outputs,
  limited to data already fetched by the route cores.
- A small, explicit chart contract with exported constants for marker prefix, max categories, max
  series, and accessibility summary behavior.
- Localized chart labels, empty-state summaries, and screen-reader summaries for `sq`, `en`, `sr`,
  and `mk`.
- Focused unit tests for chart data projection, marker rendering, accessibility summaries,
  no-data/error fallbacks, multi-currency handling, and PII-safe output keys.
- Bundle/build-size proof using the existing web build-size check path.
- Plan/tracker updates for the promoted slice and verification evidence.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- CRM reporting repositories, SQL adapters, schema/migrations, RLS, or snapshot persistence.
- Forecast snapshot scheduler behavior, backfill, run-ledger persistence, or observability
  integrations.
- Branch-manager reporting access or sidebar discoverability; this remains `P38-CRM20`.
- New charting dependencies, broad design-system rewrites, broad dashboard redesign, or visual
  regression baseline infrastructure.
- Changes to `apps/web/package.json`, `pnpm-lock.yaml`, or the installed `recharts` version.
- Stripe, README, AGENTS.md, or broad architecture docs.

## Chart Contract

CRM16 ships charting as progressive enhancement. Tables, metric bands, and existing aggregate rows
remain the source of truth. A chart must never be the only accessible representation of CRM
reporting data.

CRM16 should expose these constants from the shared CRM reporting chart boundary:

```ts
export const CRM_REPORTING_CHART_MARKER_PREFIX = 'crm-reporting-chart-';
export const CRM_REPORTING_CHART_MAX_CATEGORIES = 12;
export const CRM_REPORTING_CHART_MAX_SERIES = 6;
export const CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS = 5;
export const CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX = 30;
```

The implementation may add role-specific wrapper markers derived from existing page markers, but
the shared chart marker prefix must be stable for E2E/a11y proof.

The three shared chart marker IDs are:

- `${CRM_REPORTING_CHART_MARKER_PREFIX}pipeline-amount`
- `${CRM_REPORTING_CHART_MARKER_PREFIX}funnel-movement`
- `${CRM_REPORTING_CHART_MARKER_PREFIX}stage-velocity`

`CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX` is a gzip route-chunk ceiling. Any route chunk that newly
imports the shared CRM chart components must stay at or below a 30 kB gzip delta versus the
pre-CRM16 build for that route, or the implementation PR must fail and return to design review.

### Recharts Discipline

- `recharts` imports must be named imports from `recharts`; wildcard imports are forbidden.
- Top-level `recharts` imports are allowed only inside the shared CRM chart component boundary under
  `apps/web/src/components/crm/charts`.
- Reporting route files and route-core files must not import `recharts` directly.
- CRM16 must not change the current `recharts` version constraint, `^3.8.1`.
- Chart component files should use
  `apps/web/src/components/crm/charts/{pipeline-amount,funnel-movement,stage-velocity}-chart.tsx`
  naming unless the implementation documents a tighter local convention.
- Colors must come from existing design-system CSS tokens. Hard-coded hex colors and new theme
  tokens are out of scope.
- Animations are disabled in CRM16 to respect reduced-motion expectations and keep later visual
  proof deterministic.
- Axis labels remain readable by rotating labels at six or more categories, truncating visible axis
  labels at 20 characters, and preserving the full safe label in the text/table fallback.

### First Chart Set

CRM16 is allowed to add exactly three supplemental chart renderers:

1. **Pipeline amount comparison.** Uses existing weighted-pipeline-derived rows from agent, admin,
   or staff reporting outputs. Displays total and weighted amounts by safe branch/pipeline/source
   label, grouped by ISO currency code without conversion.
2. **Funnel movement comparison.** Uses existing funnel movement/conversion rows where available.
   Displays entered, exited, won, and lost counts by pipeline/stage label.
3. **Stage velocity comparison.** Uses existing stage velocity rows where available. Displays median
   and average days by stage label and preserves the low-sample filtering already owned by CRM15.

The first implementation must render the pipeline amount comparison on all three existing CRM
reporting pages, `/agent/crm`, `/admin/crm`, and `/staff/crm`, using only their existing aggregate
route-core outputs. Funnel movement and stage velocity render only on surfaces that already expose
the needed typed rows. If a role surface does not already expose the needed typed rows, CRM16 must
omit that chart on that surface rather than expanding the route core or adding new data reads.

Multi-currency caps apply per currency panel. A tenant with four currencies may render up to
`CRM_REPORTING_CHART_MAX_CATEGORIES` categories inside each currency panel; currency must not be
collapsed into a converted total or treated as an unbounded category multiplier in a single chart.

### Accessibility And Fallback Rules

- Every chart has a visible heading tied to the surrounding widget and a screen-reader summary.
- The screen-reader summary lists at most
  `CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS` highest-signal rows, then announces hidden counts.
- Highest-signal summary selection is deterministic per chart: pipeline amount uses weighted amount
  descending, funnel movement uses entered count descending, and stage velocity uses median days
  descending. Existing tie-breakers from the source table rows apply after the primary metric.
- Screen-reader summaries use the same localized number, percentage, duration, and ISO currency
  formatting as the visible table/metric rows.
- Charts must not remove existing tables, empty states, error states, or widget markers.
- Tooltip contents must duplicate information available in text or table form.
- Tooltips are disabled on touch pointers in CRM16; the table remains the detail surface.
- Keyboard users must not be required to interact with the chart to understand the data.
- No compact currency abbreviations are allowed; use localized full numbers plus ISO currency code.
- Multi-currency data must render as separated series/sections with explicit ISO labels, never as
  converted totals.
- Empty chart data renders no chart. The existing widget empty-state copy remains the only empty
  signal.
- CRM16 charts are client-only behind a Suspense boundary. The server-rendered table/metric fallback
  remains authoritative and visible before the chart hydrates.
- Existing `*-page-ready` markers resolve before client-only charts render; E2E readiness must not
  wait for chart paint.
- JavaScript-disabled users get the existing tables and metric bands only, which is the intended
  accessible fallback.
- No PII-bearing labels are allowed. Safe labels are branch, pipeline, stage, source, currency, and
  aggregate-safe reporting IDs already present in CRM12/CRM14/CRM15 outputs.

## Acceptance Criteria

- CRM16 adds a shared charting foundation that reuses the existing `recharts` dependency and does not
  introduce a new chart package or version bump.
- `/agent/crm`, `/admin/crm`, and `/staff/crm` each render a supplemental pipeline amount chart
  with `crm-reporting-chart-pipeline-amount` while preserving each page's existing ready marker.
- The existing page-ready markers resolve from the server-rendered table/metric content and do not
  wait for client-only chart paint.
- Existing chart-free tables/metric bands remain present and test-covered.
- Chart data is derived only from existing route-core aggregate outputs; no new reporting SQL or
  repository reads are introduced for charting.
- Multi-currency values remain grouped by ISO code without conversion.
- Chart screen-reader summaries are localized and bounded.
- Empty and error states remain text-first and accessible.
- PII regression proof covers chart data keys and rendered labels.
- Build-size proof runs through the existing web check-size path, and each affected route chunk must
  stay within `CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX` gzip delta.

## Coverage Discipline

- Unit tests must cover chart projection helpers, category/series caps, multi-currency rows,
  screen-reader summary capping, no-data fallback, and PII-shape regression.
- Component tests must assert chart markers and that existing table/metric content remains present.
- PII regression tests must live next to each chart component as
  `apps/web/src/components/crm/charts/*.pii.test.tsx` and assert rendered labels as well as data
  keys.
- Locale coverage must include `sq`, `en`, `sr`, and `mk`.
- A focused route/page test must prove the existing page-ready marker still renders after charting is
  added.
- A focused import-pattern check must prove `recharts` is imported only from the shared CRM chart
  component boundary and only through named imports.
- Bundle proof must compare affected route chunks against
  `CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX`.
- `pnpm check:db-access` must show no new charting-related DB access.

## Risks And Open Questions

- **Existing chart debt.** The repo already contains `recharts` usage outside CRM reporting. CRM16
  should standardize CRM reporting charts without broad cleanup of unrelated legacy analytics
  charts.
- **Bundle size.** Reusing `recharts` avoids a dependency delta, but implementation still needs web
  build-size proof because imports can affect route chunks.
- **SSR/CSR hydration.** `ResponsiveContainer` depends on client layout and can flash empty or
  mismatch during hydration. CRM16 therefore uses client-only chart components behind server-rendered
  table fallbacks.
- **Accessibility.** Recharts output is not sufficient by itself; the shared component must provide
  text summaries and preserve table fallbacks.
- **Role surface breadth.** CRM16 is a foundation slice, not a full dashboard redesign. It should
  prove the shared contract with the smallest useful set of existing CRM reporting surfaces.
- **Historical trends.** Backfill and observability trends remain later slices. CRM16 should not
  invent historical data or scheduled-job dashboards.

## Dependency / Sequencing

CRM16 depends on:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM12 Reporting Dashboard UI`.
- `P38-CRM14 Admin Reporting Dashboard UI`.
- `P38-CRM15 Staff Reporting Dashboard UI`.

CRM16 should land before:

- `P38-CRM20 Admin Reporting Branch-Manager Surface`.
- `P38-CRM18 Forecast Snapshot Observability`.
- `P38-CRM17 Forecast Snapshot Backfill`.
- Historical trend or visual-regression work that assumes a charting standard.

CRM16 is independent of routing persistence (`P38-CRM08`), routing admin UX (`P38-CRM09`), legacy
deal column retirement (`P38-CRM10`), and CRM04 nullability tightening (`P38-CRM11`).

## Non-Goals

- New CRM reporting read-models, SQL adapters, schema/migrations, RLS, or backfill.
- Branch-manager reporting UI or sidebar access.
- Replacing existing tables with charts.
- New charting dependencies or broad design-system chart packages.
- Refactoring existing non-CRM-reporting `recharts` call sites.
- Visual-regression infrastructure or screenshot baseline policy.
- Forecast snapshot scheduler changes, run-ledger persistence, historical backfill, or observability
  integrations.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS.md, or broad
  architecture-doc changes.

## Verification Plan

- `pnpm --filter @interdomestik/web test:unit --run src/components/crm`
- Focused route/page tests for the touched CRM reporting page(s).
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web lint -- src/components/crm`
- Import-pattern check for named `recharts` imports only under
  `apps/web/src/components/crm/charts`.
- `pnpm i18n:check`
- `pnpm i18n:purity:check`
- `pnpm check:db-access`
- `pnpm --filter @interdomestik/web build:ci`
- `pnpm --filter @interdomestik/web check:size`, which runs `apps/web/scripts/check-size.mjs`
  against the built app artifacts and must prove the 30 kB gzip per-route delta target.
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `interdomestik_qa.scope_audit` with docs plus explicitly authorized CRM charting component and
  touched reporting-page paths.

## Promotion Boundary

This gate opens `P38-CRM16 Reporting Charting Foundation` only. It does not authorize branch-manager
reporting, backfill, observability, schema changes, scheduler changes, run-ledger persistence,
routing persistence, cleanup/tightening gates, proxy edits, canonical route changes, auth/tenancy
architecture changes, Stripe, README, AGENTS, or broad architecture-doc changes.

## Promotion / Sign-Off

| Slice                                                    | Status   | Authority            | Notes                                                       |
| -------------------------------------------------------- | -------- | -------------------- | ----------------------------------------------------------- |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete | PR `#756`            | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.    |
| `P38-CRM12 Reporting Dashboard UI`                       | complete | PR `#757`            | Merge commit `3a220ea88eb0c2b765b56d3d926edd21952b3def`.    |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | complete | PR `#759`            | Merge commit `5544ffdea752031086a5bf5cda8b5892af6e3a83`.    |
| `P38-CRM14 Admin Reporting Dashboard UI`                 | complete | PR `#761`            | Merge commit `de4e60c4ed79d81a6f92e721a4ad04ab1944151b`.    |
| `P38-CRM15 Staff Reporting Dashboard UI`                 | complete | PR `#764`            | Merge commit `7315b1b1548abb156f91a16cdb0a1dce7c863bff`.    |
| `P38-DG12 Reporting Charting Foundation Design Review`   | complete | tracker/program gate | Promotes exactly one bounded charting foundation slice.     |
| `P38-CRM16 Reporting Charting Foundation`                | promoted | `P38-DG12`           | Shared CRM reporting chart contract only.                   |
| `P38-CRM20 Admin Reporting Branch-Manager Surface`       | reserved | later gate           | Branch-manager reporting surface remains deferred.          |
| `P38-CRM21 Visual Regression Baseline`                   | reserved | later gate           | Visual baseline infrastructure remains deferred.            |
| `P38-CRM18 Forecast Snapshot Observability`              | reserved | later gate           | Alerting and run telemetry dashboards remain deferred.      |
| `P38-CRM17 Forecast Snapshot Backfill`                   | reserved | later gate           | Historical backfill and operator runbook remain deferred.   |
| `P38-CRM19 Forecast Snapshot Backfill Operator UX`       | reserved | post-backfill        | Operator-facing backfill controls remain deferred.          |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | future gate          | Still valid, but not selected ahead of reporting charting.  |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing         | Requires routing persistence first.                         |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | later gate           | Requires normalized-reader confidence and retirement proof. |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate           | Requires production zero-null evidence.                     |
