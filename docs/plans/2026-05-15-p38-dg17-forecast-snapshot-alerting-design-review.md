# P38-DG17 Forecast Snapshot Alerting Design Review

Status: complete
Slice: `P38-DG17`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-15
Authority: completed design gate. This document promotes exactly one implementation slice.
Recommended implementation slice: `P38-CRM22 Forecast Snapshot Alerting`
Promoted implementation slice: `P38-CRM22 Forecast Snapshot Alerting`

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice. Tracker queue statuses remain
the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`; this design uses
`deferred` only as prose for non-promoted candidates, not as a tracker status.

## Status / Predecessor Closeout

`P38-CRM19 Forecast Snapshot Backfill Operator UX` is complete through PR `#775`, merge commit
`fde3a6c7d19268c5b8935f169dacfc1780cc7c59`. The tracker closeout sync landed through PR `#776`,
merge commit `e0df5f30f576679d0daee789077aec598bbab97e`, and recorded the Notion proof page at
`https://www.notion.so/361036cff1f881468447fe4cf1a8e69c`.

The forecast snapshot operations line now has:

- CRM05 reporting read-models and append-only snapshot persistence.
- CRM12, CRM14, CRM15, CRM16, and CRM20 reporting consumption across agent, admin, staff, chart, and
  branch-manager surfaces.
- CRM13 protected daily forecast snapshot scheduler.
- CRM18 admin-only forecast snapshot observability on `/admin/crm`.
- CRM17 tenant-scoped protected historical backfill.
- CRM19 admin-only dry-run-first backfill operator UX.

The remaining operational gap is proactive in-app alerting. Admins can inspect snapshot health and
repair gaps, but the `/admin/crm` surface still lacks a compact severity summary that turns CRM18
observability output into a deterministic operator signal.

## Decision

Recommend exactly one bounded implementation candidate:

`P38-CRM22 Forecast Snapshot Alerting`

The recommended slice adds an admin-only alert band to the existing `/admin/crm` surface, derived
from the already-computed CRM18 observability widget. It should be informational-only, aggregate-only,
localized, and deterministic. It must not add Slack/email/Sentry notifications, external alerting,
new routes, schema, run-ledger persistence, scheduler changes, or branch-manager output.

DG17 approval would permit the implementation PR to update `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, and proof metadata for `P38-DG17` / `P38-CRM22`.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                       |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM22 Forecast Snapshot Alerting`             | Recommend. Observability, backfill, and operator UX are merged; admins need a severity signal. |
| 2    | `P38-CRM21 Visual Regression Baseline`             | Defer. Useful infrastructure, but less direct than snapshot operations alerting.               |
| 3    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Independent from the forecast snapshot operations sequence.                             |
| 4    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires routing persistence first.                                                     |
| 5    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.                    |
| 6    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                         |

## Source Inputs

- `P38-CRM18 Forecast Snapshot Observability`, PR `#770`, merge commit
  `a3712de4e0f99dd92999749e036ef6ae4fb770a7`.
- `P38-CRM17 Forecast Snapshot Backfill`, PR `#773`, merge commit
  `00076c953d8b34f9e13f0f9822891404f27523f0`.
- `P38-CRM19 Forecast Snapshot Backfill Operator UX`, PR `#775`, merge commit
  `fde3a6c7d19268c5b8935f169dacfc1780cc7c59`.
- `P38-CRM20 Admin Reporting Branch-Manager Surface`, PR `#768`, merge commit
  `6d1175116d44c60bd320ac67d479e822180d6503`.
- Current CRM18 admin route-core contract in
  `apps/web/src/app/[locale]/admin/crm/_core.ts`.

## Implementation Scope For P38-CRM22

Allowed:

- Add a compact admin-only forecast snapshot alert band to existing `/admin/crm`, near the CRM18
  observability band and CRM19 operator band.
- Derive alert severity from the existing CRM18 `AdminCrmForecastObservabilityWidget` returned by
  `getAdminCrmReportingCore`.
- Export deterministic alert constants, severity union, marker IDs, and typed result shape.
- Render aggregate-only metrics derived from CRM18 summary fields.
- Add localized `sq`, `en`, `sr`, and `mk` copy.
- Add focused route-core/component/i18n/PII/E2E proof.
- Update tracker/program proof for DG17/CRM22 only after this design review is approved.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names, route authority, auth/session layering, or tenant isolation architecture.
- Schema/migrations, RLS policies, snapshot table shape, or run-ledger tables.
- Scheduler behavior, Vercel cron config, CRM17 public API contract, CRM19 backfill action semantics,
  queue workers, or all-tenant fleet backfill.
- `/agent/crm`, `/staff/crm`, member UI, unrelated admin pages, branch-manager output shapes, or
  charting components.
- Slack/email/Sentry notifications, external observability dashboards, alert delivery integrations,
  routing persistence, routing admin UX, legacy deal cleanup, CRM04 nullability tightening, Stripe,
  README, AGENTS.md, or broad architecture docs.

## Route And Authorization Contract

CRM22 uses the existing `/admin/crm` page. It must not add an alert subroute, a route handler, a
branch-manager alert route, or a staff/agent/member alert surface.

Authorization is enforced through the existing admin CRM route-core split:

1. Existing canonical route authority admits only roles already allowed into the `/admin` shell.
2. The existing `/admin/crm` route resolves session tenant, actor ID, and role before admin CRM
   route-core data is loaded.
3. `admin`, `tenant_admin`, and `super_admin` sessions may receive the CRM22 alert band through the
   normalized CRM `admin` actor path.
4. `branch_manager` sessions continue to dispatch to the CRM20 branch-manager core and must not
   receive CRM18 observability rows or CRM22 alert output.
5. Staff, agent, member, tenantless, and actorless sessions fail closed before alert derivation.
6. Renderer-level conditionals are not the enforcement layer. The admin route core must only attach
   alert data on the admin branch, and branch-manager route-core output must not contain alert props.

The existing `admin-crm-page-ready` marker remains authoritative for page readiness. CRM22 markers
must not make page readiness wait for client-side alert paint.

## CRM18 Import Boundary

CRM22 must not introduce a parallel forecast observability repository path. The implementation should
derive from the CRM18 data already returned by the admin route core:

```ts
import type {
  AdminCrmForecastObservabilitySummary,
  AdminCrmForecastObservabilityWidget,
} from './_core';
```

The first implementation should add a pure helper such as:

```ts
export function deriveAdminCrmForecastAlert(
  forecastObservability: AdminCrmForecastObservabilityWidget
): AdminCrmForecastAlertResult;
```

`getAdminCrmReportingCore` already reads CRM18 observability once per request and returns
`forecastObservability`. CRM22 should reuse that value in the same route-core render pass. It should
not call `crmForecastSnapshotObservabilityRepository.listObservedSnapshots` independently and should
not duplicate CRM18 expected-work-item reads.

CRM22 relies on the current CRM18 widget discriminator shape from
`apps/web/src/app/[locale]/admin/crm/_core.ts`:

```ts
export type AdminCrmForecastObservabilityWidget =
  | {
      state: 'data';
      summary: AdminCrmForecastObservabilitySummary;
      coverageRows: AdminCrmForecastObservabilityCoverageRow[];
      batchRows: AdminCrmForecastObservabilityBatchRow[];
      hiddenCoverageRowCount: number;
    }
  | {
      state: 'empty';
      summary: AdminCrmForecastObservabilitySummary;
      coverageRows: [];
      batchRows: [];
      hiddenCoverageRowCount: 0;
    }
  | {
      state: 'error';
      summary: null;
      coverageRows: [];
      batchRows: [];
      hiddenCoverageRowCount: 0;
      messageKey: string;
    };
```

`state: 'error'` maps to CRM22 `unknown`. `state: 'data'` and `state: 'empty'` both carry a summary
and are evaluated by the pinned alert rules. If CRM18 later adds another widget state, CRM22 tests
must either map it explicitly or fail until the alert contract is reviewed.

## Exported Constants

The implementation should export constants and use them in tests rather than duplicating literals:

```ts
export const ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX = 'admin-crm-forecast-alert-';

export const ADMIN_CRM_FORECAST_ALERT_BAND_MARKER = `${ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX}band`;
export const ADMIN_CRM_FORECAST_ALERT_STATUS_MARKER = `${ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX}status`;
export const ADMIN_CRM_FORECAST_ALERT_METRICS_MARKER = `${ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX}metrics`;

export const ADMIN_CRM_FORECAST_ALERT_SEVERITIES = [
  'ok',
  'warning',
  'critical',
  'unknown',
] as const;

export type AdminCrmForecastAlertSeverity = (typeof ADMIN_CRM_FORECAST_ALERT_SEVERITIES)[number];

export const ADMIN_CRM_FORECAST_ALERT_STALE_WORK_ITEMS_CRITICAL_THRESHOLD = 1;
export const ADMIN_CRM_FORECAST_ALERT_ZERO_OBSERVED_CRITICAL_THRESHOLD = 0;
export const ADMIN_CRM_FORECAST_ALERT_DEFERRED_WORK_ITEMS_WARNING_THRESHOLD = 1;
export const ADMIN_CRM_FORECAST_ALERT_MISSING_WORK_ITEMS_WARNING_THRESHOLD = 1;
export const ADMIN_CRM_FORECAST_ALERT_DELAYED_WORK_ITEMS_WARNING_THRESHOLD = 1;
export const ADMIN_CRM_FORECAST_ALERT_UNEXPECTED_WORK_ITEMS_WARNING_THRESHOLD = 1;
```

The severity array order is intentional: `ok` default, escalating `warning` and `critical`, then
`unknown` as the edge/non-actionable state. UI legends and tests may rely on that stable order.

All `*_THRESHOLD = 1` constants are an intentional first-slice zero-tolerance posture: any single
matching stale, missing, delayed, deferred, or unexpected observed work item should surface in the
alert. Tunable thresholds or per-tenant configuration require a later configuration gate.

## Output Shape

CRM22 must expose a typed route-core output shape:

```ts
export interface AdminCrmForecastAlertMetrics {
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

export interface AdminCrmForecastAlertResult {
  severity: AdminCrmForecastAlertSeverity;
  headlineMessageKey: string;
  explanationMessageKey: string;
  metrics: AdminCrmForecastAlertMetrics;
  snapshotDate: string | null;
  generatedAt: string | null;
}
```

The result must be aggregate-only. It must not include branch IDs, pipeline IDs, source row payloads,
deal IDs, contact IDs, lead IDs, names, emails, phone numbers, descriptions, subjects, or notes.

`snapshotDate` and `generatedAt` mirror CRM18 summary fields when a summary exists. Both are `null`
only when `severity === 'unknown'` because the CRM18 widget is in `state: 'error'` and has no
summary. For the `summary.expectedWorkItems === 0` unknown case, both fields remain populated from
the summary.

### Message Keys

The first slice uses a 1:1 severity-to-copy mapping. It does not select per-condition copy such as
`criticalZeroObserved` or `criticalStale`; richer per-rule copy is deferred.

| Severity   | Headline key                        | Explanation key                        |
| ---------- | ----------------------------------- | -------------------------------------- |
| `ok`       | `admin-crm:alert.ok.headline`       | `admin-crm:alert.ok.explanation`       |
| `warning`  | `admin-crm:alert.warning.headline`  | `admin-crm:alert.warning.explanation`  |
| `critical` | `admin-crm:alert.critical.headline` | `admin-crm:alert.critical.explanation` |
| `unknown`  | `admin-crm:alert.unknown.headline`  | `admin-crm:alert.unknown.explanation`  |

I18n tests must enumerate these eight keys across `sq`, `en`, `sr`, and `mk`.

## Alert Rules

CRM22 derives severity from the real CRM18 summary fields:

```ts
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
```

Severity precedence is deterministic:

1. `unknown` is chosen when `forecastObservability.state === 'error'`,
   `forecastObservability.summary === null`, or `summary.expectedWorkItems === 0`.
2. `critical` is chosen when `summary.expectedWorkItems > 0` and either:
   - `summary.observedWorkItems === ADMIN_CRM_FORECAST_ALERT_ZERO_OBSERVED_CRITICAL_THRESHOLD`; or
   - `summary.staleWorkItems >= ADMIN_CRM_FORECAST_ALERT_STALE_WORK_ITEMS_CRITICAL_THRESHOLD`.
3. `warning` is chosen when no `critical` condition holds and any of these is true:
   - `summary.missingWorkItems >= ADMIN_CRM_FORECAST_ALERT_MISSING_WORK_ITEMS_WARNING_THRESHOLD`;
   - `summary.delayedWorkItems >= ADMIN_CRM_FORECAST_ALERT_DELAYED_WORK_ITEMS_WARNING_THRESHOLD`;
   - `summary.expectedWorkItemsDeferred >=
ADMIN_CRM_FORECAST_ALERT_DEFERRED_WORK_ITEMS_WARNING_THRESHOLD`;
   - `summary.unexpectedObservedWorkItems >=
ADMIN_CRM_FORECAST_ALERT_UNEXPECTED_WORK_ITEMS_WARNING_THRESHOLD`.
4. `ok` is chosen when `summary.expectedWorkItems > 0` and no `critical` or `warning` condition
   holds.

`unknown` is mutually exclusive with `ok` and should not mask a valid summary containing work items.
For valid summaries, precedence is `critical > warning > ok`.

Severity maps to the message keys through the 1:1 table above. Multiple matching conditions affect
only the chosen severity through precedence; they do not change the headline or explanation key in
the first CRM22 slice.

## UI Scope

The first CRM22 UI is informational-only:

- Render a compact alert band near CRM18 observability and CRM19 backfill operator controls.
- Show severity, headline, short explanation, and aggregate metrics only.
- Use the derived marker constants:
  - `${ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX}band`
  - `${ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX}status`
  - `${ADMIN_CRM_FORECAST_ALERT_MARKER_PREFIX}metrics`
- Do not add click-to-repair, auto-scroll, prefilled CRM19 date ranges, or automatic backfill
  submission in CRM22. Alert-to-CRM19 workflow shortcuts require a later promoted slice.
- Counts must use `Intl.NumberFormat` with locale-aware grouping.
- Do not rely on color alone for severity. Include text labels and accessible status semantics.
- Respect reduced-motion preferences; no animated alert effects are required.

## Performance And Caching

Alert derivation must be cheap because it runs on every admin `/admin/crm` page load. The route-core
target is less than 100 ms p95 against seed-sized data for the pure alert derivation itself, excluding
the existing CRM18 observability repository reads. This budget is informational for CRM22 and is not
CI-blocking in the first slice; CI enforcement would require a later performance gate.

The implementation should reuse the CRM18 `forecastObservability` value already loaded by
`getAdminCrmReportingCore` in the same request. It must not perform duplicate expected-work-item or
observed-snapshot reads solely for CRM22.

## PII And Logging Rules

CRM22 output is aggregate-only. The route-core result, UI props, tests, and logs must not expose:

- contact names, full names, emails, phone numbers, descriptions, subjects, or notes;
- deal IDs, contact IDs, lead IDs, account IDs, branch IDs, pipeline IDs, or raw row payloads;
- raw CRM18 repository failures, SQL errors, request bodies, authorization headers, `CRON_SECRET`,
  or the CRM19 `CRM_BACKFILL_CONFIRMATION_SECRET`.

PII regression tests must inspect the concrete `AdminCrmForecastAlertResult` key list and recurse
through nested metrics. Recursion stops at primitive values; string values are not inspected for PII
content because CRM22 string fields are localization keys or ISO timestamps, not user-authored
content.

Server logs, if any, should use an aggregate-only prefix such as `[Admin CRM Forecast Alert]` and log
only severity, snapshot date, generated timestamp, and aggregate counters.

## Acceptance Criteria

- Admin-like sessions see the alert band on `/admin/crm`.
- Branch-manager sessions render no CRM22 alert markers and receive no alert props from the
  branch-manager route core.
- Staff, agent, member, tenantless, and actorless sessions cannot reach alert derivation.
- Alert severity is derived deterministically from the pinned CRM18 summary fields.
- `critical`, `warning`, `ok`, and `unknown` are each covered by focused tests.
- `critical` takes precedence over `warning` when multiple conditions match.
- The alert band is aggregate-only and PII-safe at every depth.
- `admin-crm-page-ready` remains server-rendered and unaffected by alert client paint.
- CRM18 observability output remains authoritative; CRM22 does not duplicate observability reads.
- Localized copy exists for `sq`, `en`, `sr`, and `mk`.

## Coverage Discipline

Focused tests should include:

- Pure derivation tests for `unknown` from error/null/no-expectation summaries.
- Pure derivation tests for `critical` zero observed work items and stale work items.
- Pure derivation tests for `warning` missing, delayed, deferred, and unexpected observed work
  items.
- Pure derivation test proving `critical > warning > ok` precedence.
- Route-core/page tests proving admin marker presence and branch-manager marker absence.
- PII regression test asserting no unsafe keys at any depth of `AdminCrmForecastAlertResult`.
- I18n tests for severity labels, headline copy, explanation copy, and metric labels in `sq`, `en`,
  `sr`, and `mk`.
- E2E smoke tagged narrowly with `@admin-crm-forecast-alert`, including one admin marker proof and
  one branch-manager marker-absence proof.

## Risks And Open Questions

- **Stale observability data.** Alerts can reflect the latest available snapshot rows, not a durable
  scheduler run ledger. Copy should say "snapshot signal" rather than "incident" or "SLA breach".
- **Severity drift.** Future Slack/email/Sentry alerting must reuse or explicitly supersede the CRM22
  severity constants, not invent a parallel rule set.
- **Branch-manager leakage.** Route-core split and marker-absence tests are required because
  renderer-only conditionals are not enough.
- **Page readiness delay.** Alert derivation must reuse the existing CRM18 widget and avoid duplicate
  reads.
- **Severity flapping.** During the day, snapshot arrival can move `warning` to `ok`. The UI should
  present current-state severity only and should not imply durable incident history.

## Dependency / Sequencing

CRM22 depends on CRM18 observability and should reuse its output shape. CRM19 is a recommended
predecessor because the alert can point operators toward the existing repair band, even though CRM22
must remain informational-only in the first slice.

CRM22 should land before any external-notification slice. External delivery via Slack, email, Sentry,
or another incident channel requires a later gate that either imports the CRM22 severity contract or
documents why it is superseded.

## Review Questions

1. Should `expectedWorkItems === 0` produce `unknown` rather than `ok`?
   - Author recommendation: yes. No expectation baseline means health cannot be proven.

2. Should `staleWorkItems > 0` be `critical` while `delayedWorkItems > 0` remains `warning`?
   - Author recommendation: yes. This matches CRM18's delayed/stale threshold semantics and keeps
     truly old snapshots above transient lateness.

3. Should `unexpectedObservedWorkItems > 0` be `warning` rather than `critical`?
   - Author recommendation: yes. It indicates data-shape drift worth surfacing, but it does not
     prove missing current coverage when expected rows are otherwise healthy.

4. Should CRM22 add alert-to-CRM19 affordances?
   - Author recommendation: no for the first slice. Keep CRM22 informational-only; workflow shortcuts
     require a later UX slice.

5. Should the first slice include external alert delivery?
   - Author recommendation: no. The in-app severity contract should stabilize before external
     notification fanout.

## Verification Plan

Draft-review PR verification:

```bash
git diff --check
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm verify-slice -- --static
```

Implementation PR verification after approval:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/admin/crm'
pnpm --filter @interdomestik/web test:e2e -- --grep '@admin-crm-forecast-alert'
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm check:db-access
pnpm i18n:check
pnpm i18n:purity:check
pnpm --filter @interdomestik/web check:size
pnpm repo:size:check
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
git diff --check
pnpm verify-slice -- --static
pnpm verify-slice -- --required-gates
```

The implementation PR should also run `interdomestik_qa.scope_audit` with allowed paths limited to
the existing admin CRM route-core/page/component files, localized message files, focused E2E tests,
and tracker/program proof. `apps/web/src/proxy.ts`, schema/migrations/RLS, Vercel cron config,
staff/agent/member UI, README, AGENTS.md, and broad architecture docs must be forbidden.

## Promotion Boundary

This review draft is docs-only and should not update `docs/plans/current-program.md` or
`docs/plans/current-tracker.md` until approved. The approval PR should flip DG17 to `complete`,
promote exactly one implementation slice (`P38-CRM22`), add the corresponding current-program and
current-tracker rows, and record predecessor proof.

The eventual sign-off table should record CRM05, CRM12, CRM13, CRM14, CRM15, CRM16, CRM17, CRM18,
CRM19, and CRM20 as completed predecessors. CRM21, CRM08, CRM09, CRM10, and CRM11 remain reserved.
CRM06 and CRM07 remain completed parallel-track dedupe/routing foundations for P38 and may be
acknowledged as non-blocking context.

## Approval Bar

DG17 should be approved only if reviewers agree that:

- severity rules are pinned to the real CRM18 output shape;
- CRM22 derives from CRM18 output once per request;
- branch-manager exclusion is enforced by route-core split, not renderer-only conditionals;
- the first slice is in-app and informational-only;
- no tracker status vocabulary change is introduced.
