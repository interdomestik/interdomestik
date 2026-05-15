# P38-DG16 Forecast Snapshot Backfill Operator UX Design Review

Status: complete
Slice: `P38-DG16`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-15
Authority: completed design gate. This document promotes exactly one implementation slice.
Recommended implementation slice: `P38-CRM19 Forecast Snapshot Backfill Operator UX`
Promoted implementation slice: `P38-CRM19 Forecast Snapshot Backfill Operator UX`

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice.

## Status / Predecessor Closeout

`P38-CRM17 Forecast Snapshot Backfill` is complete through PR `#773`, merge commit
`00076c953d8b34f9e13f0f9822891404f27523f0`. The merged slice added the protected
`POST /api/cron/crm/forecast-snapshots/backfill` operational API, strict tenant-scoped request
validation, dry-run and write execution, bounded historical UTC date ranges, per-date work-item
caps, per-date weighted-row cache isolation, distinct backfill actor/log/source-run/idempotency
namespaces, per-work-item soft timeouts, append-only snapshot inserts, aggregate-only nested
PII-safe output/logging, and scheduler non-regression proof.

This promotion PR closes the CRM17 repo-tracker sync gap in `docs/plans/current-program.md` and
`docs/plans/current-tracker.md`, recording PR `#773`, merge commit
`00076c953d8b34f9e13f0f9822891404f27523f0`, and the Notion closeout page
`PR 773 P38 CRM17 Forecast Snapshot Backfill`.

The reporting and forecast operations tranche now has:

- CRM05 reporting read-models and append-only snapshot persistence.
- CRM13 protected daily forecast snapshot scheduler.
- CRM14, CRM15, CRM16, and CRM20 reporting consumption across admin, staff, chart enhancement, and
  branch-manager surfaces.
- CRM18 admin-only snapshot health visibility on `/admin/crm`.
- CRM17 manually invoked, tenant-scoped protected historical repair.

The next operational gap is safe operator ergonomics: trusted admins can see snapshot gaps through
CRM18 and repair them through CRM17, but there is no product-surface workflow that lets an authorized
admin perform a dry-run first, inspect aggregate impact, and deliberately confirm write mode without
copying cron secrets or constructing raw API requests.

## Decision

Promote exactly one bounded implementation candidate:

`P38-CRM19 Forecast Snapshot Backfill Operator UX`

The promoted slice adds an admin-only operator control surface on the existing `/admin/crm` route
for invoking the CRM17 backfill core through an admin-authenticated server boundary. It should be
small, dry-run-first, aggregate-only, and explicit about append-only writes. It must not expose
`CRON_SECRET` to the browser, add a durable run ledger, add all-tenant fleet backfill, mutate
scheduler behavior, introduce alerting, or create a new canonical route.

DG16 approval permits the implementation PR to update `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, and proof metadata for `P38-DG16` / `P38-CRM19`.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                  |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | `P38-CRM19 Forecast Snapshot Backfill Operator UX` | Promoted. CRM17 is merged; operators need a safe dry-run-first repair workflow.           |
| 2    | `P38-CRM22 Forecast Snapshot Alerting`             | Defer. Alerting should follow a stable operator workflow or durable run-history contract. |
| 3    | `P38-CRM21 Visual Regression Baseline`             | Defer. Useful, but less urgent than making snapshot repair operable.                      |
| 4    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Independent from the forecast snapshot operations sequence.                        |
| 5    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Requires routing persistence first.                                                |
| 6    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized-reader confidence and explicit retirement proof.               |
| 7    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                    |

## Implementation Scope For P38-CRM19

Allowed:

- Add a compact admin-only backfill operator band to the existing `/admin/crm` page, positioned near
  the CRM18 forecast snapshot observability band.
- Add a server-action or route-core-adjacent server boundary for admin-triggered backfill operations.
- Reuse the CRM17 backfill core directly from server-side code.
- Add dry-run-first operator flow for one tenant and a bounded UTC date range.
- Require explicit write confirmation after a successful or partially successful dry-run.
- Render aggregate-only current-request results using the CRM17 output shape or a PII-safe UI
  projection derived from it.
- Add localized copy for `sq`, `en`, `sr`, and `mk`.
- Add focused route-core/action/component/i18n/PII/E2E marker tests.
- Update tracker/program proof for CRM17 closeout and the promoted CRM19 slice only after this
  design review is approved.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names, route authority, auth/session layering, or tenant isolation architecture.
- Schema/migrations, RLS policies, snapshot table shape, or run-ledger tables.
- Existing daily scheduler route behavior, cron authorization semantics, Vercel cron config, or
  CRM13 default previous-UTC scheduler behavior.
- The CRM17 public API route contract except for narrow internal extraction that preserves existing
  CRM17 route behavior and tests.
- `/agent/crm`, `/staff/crm`, member UI, unrelated admin pages, branch-manager CRM output shapes, or
  charting components.
- Alerting integrations, Slack/email notifications, external observability dashboards, log-scraping
  integrations, all-tenant fleet backfill, durable run history, queue workers, routing persistence,
  routing admin UX, legacy deal cleanup, CRM04 nullability tightening, Stripe, README, AGENTS.md, or
  broad architecture docs.

## Route And Authorization Contract

CRM19 uses the existing `/admin/crm` route. It must not add `/admin/crm/backfill`,
`/admin/crm/snapshots/backfill`, a branch-manager route, a staff route, or a cron route.

Authorization layers:

1. Existing canonical route authority admits only roles already allowed into the `/admin` shell.
2. The existing `/admin/crm` route resolves tenant, actor, and role through the current admin CRM
   boundary.
3. `admin`, `tenant_admin`, and `super_admin` sessions may see and submit the CRM19 operator band
   when tenant and actor identity are present.
4. `branch_manager` sessions remain on the CRM20 branch-manager core and must not see CRM19 controls,
   markers, request fields, confirmation copy, result copy, or action endpoints.
5. Staff, agent, member, tenantless, and actorless sessions fail closed before the CRM19 server
   action can invoke the backfill core.
6. The server boundary maps the authorized admin session to a direct CRM17 core invocation. It must
   not issue an HTTP request to `POST /api/cron/crm/forecast-snapshots/backfill`, and it must not
   read, transmit, serialize, or expose `CRON_SECRET`.

CRM19 uses an admin-authenticated server action, not a route handler. The server action should be
exported as `triggerCrmForecastSnapshotBackfill` from the colocated admin CRM backfill action file.
The cron API remains available for runbook automation, while the UI path uses session authorization
and invokes the shared core directly.

## Operator Flow Contract

CRM19 is a dry-run-first workflow:

1. Admin enters or selects a single tenant ID, `fromDate`, `toDate`, and optional
   `maxWorkItemsPerDate`.
2. The first submitted operation is always `dryRun: true`.
3. The dry-run server action returns an aggregate result and a `confirmationToken` only when the
   dry-run result status is `completed` or `partial`; all-failed dry-runs do not authorize write
   mode.
4. The `confirmationToken` is an HMAC-signed token over
   `(tenantId, fromDate, toDate, maxWorkItemsPerDate, dryRunCompletedAt, actorId, tokenId)`, using a
   server-only `CRM_BACKFILL_CONFIRMATION_SECRET`. CRM19 must not reuse `CRON_SECRET` for this token.
5. The token is valid for
   `ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_CONFIRMATION_TTL_SECONDS = 600` seconds after
   `dryRunCompletedAt`. Expired tokens fail closed with `confirmation_expired`.
6. The write server action requires the token, recomputes the HMAC, verifies the actor and normalized
   request tuple match, and rejects drifted or tampered input with `confirmation_invalid`.
7. Confirmation tokens are single-use. A token consumed by a write attempt, whether the write
   completes, partially completes, or fails, cannot authorize another write.
8. A second write submission while the same token is already in flight returns
   `confirmation_in_flight`, not silent deduplication and not a second append-only write.
9. Admin must deliberately confirm write mode through a separate control. Changing any request field
   invalidates the previous confirmation and requires a new dry-run.
10. Write mode invokes the same server boundary with `dryRun: false`.
11. The page renders only the current request result. It does not create durable history, store prior
    runs in local storage, or infer scheduler health beyond the returned CRM17 aggregate result.

The implementation may use a small client component for form state and confirmation state. The data
mutation itself must stay in the server action boundary, with no secret-bearing client props.

The confirmation-token registry is not a durable run ledger. It may use the existing non-schema
server-side cache/rate-limit infrastructure or a narrowly scoped, injectable confirmation store with
TTL and test fixtures. The implementation must not add schema, migrations, RLS, or durable run-history
persistence for token state in this slice.

## Request Contract

CRM19 exposes a UI projection of the CRM17 request shape:

```ts
export interface AdminCrmForecastBackfillOperatorRequest {
  tenantId: string;
  fromDate: string;
  toDate: string;
  maxWorkItemsPerDate?: number;
}
```

The server boundary owns normalization and validation:

- `tenantId` is trimmed and must be non-empty.
- `tenantId` must match `^[A-Za-z0-9_-]{1,64}$` in the CRM19 UI/server boundary unless existing
  tenant-ID helpers require a stricter local format.
- The authenticated session tenant is authoritative. The server action must derive the effective
  tenant from the current session and require the submitted `tenantId` to match it before invoking
  CRM17 core. CRM19 does not add cross-tenant super-admin backfill in this slice; any mismatch
  returns `invalid_tenant` or `unauthorized` and is covered by a focused test.
- `fromDate` and `toDate` are ISO `YYYY-MM-DD` UTC dates. UI fields should use
  `<input type="date">` while the server remains authoritative for validation.
- `fromDate <= toDate`.
- `toDate` must be no later than the previous UTC date at action-core entry.
- `fromDate` must not be earlier than CRM17's lower bound:
  `previousUtcDate - CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_LOOKBACK_DAYS`, with the same inclusive
  boundary semantics and localized `date_out_of_bounds` mapping as the CRM17 route/core.
- Date count must not exceed `CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS`.
- `maxWorkItemsPerDate`, when present, must be a positive integer no greater than
  `CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE`.
- Unknown request fields fail closed.
- The server boundary passes `dryRun: true` or `dryRun: false` internally based on the submitted
  operator action, not from an uncontrolled browser field.

CRM19 should import CRM17 constants where possible rather than duplicating limits in UI code. If a
UI-specific cap is needed, it must be exported as a CRM19 constant and tested.

## Server Boundary Contract

The implementation adds a testable server action/core split under the admin CRM route or an existing
admin CRM actions namespace. Candidate file locations:

- `apps/web/src/app/[locale]/admin/crm/_backfill-action.ts`
- `apps/web/src/app/[locale]/admin/crm/_backfill-core.ts`
- `apps/web/src/app/[locale]/admin/crm/_backfill-core.test.ts`
- `apps/web/src/app/[locale]/admin/crm/_backfill-core.pii.test.ts`
- `apps/web/src/app/[locale]/admin/crm/_backfill-confirmation.ts`
- `apps/web/src/app/[locale]/admin/crm/_backfill-confirmation.test.ts`

The exact file names may follow existing admin CRM conventions, but the boundary must remain local to
the existing admin CRM surface.

The server boundary must:

- Resolve the current session and re-check `actor.role` at action entry before parsing request
  fields, validating dates, reading confirmation tokens, or invoking CRM17 core.
- Distinguish session roles from normalized CRM actors: only `admin`, `tenant_admin`, and
  `super_admin` session roles may proceed, and the resolved `CrmActorContext.role` must be the
  existing normalized `admin` actor role with the same tenant as the session.
- Reject branch managers and tenantless/adminless sessions with `unauthorized` before request
  validation and before CRM17 core invocation.
- Build CRM17 core inputs using the session-derived tenant, the normalized request dates/caps, a
  route-core entry timestamp, and the existing CRM17 default dependencies. The browser-submitted
  `tenantId` is a confirmation input, not an authorization source.
- Define `generatedAt` as the server-action entry timestamp for the dry-run or write operation, not a
  CRM17 database timestamp and not a client timestamp.
- Preserve CRM17 append-only semantics, per-date cache isolation, soft timeouts, and PII-safe result
  assertion.
- Return a typed UI result union with stable error codes, not raw thrown errors or message-substring
  mapping.
- Revalidate the admin CRM page only after write mode succeeds or partially succeeds, using a
  locale-aware wrapper equivalent to `revalidatePathForAllLocales('/admin/crm')`. Dry-run mode must
  not trigger broad cache invalidation unless existing action patterns require it for form state.

## Rate Limiting

CRM19 adds per-actor action limits because the UI exposes a powerful repair operation behind an
admin session:

```ts
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_DRY_RUN_RATE_LIMIT = 6;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_WRITE_RATE_LIMIT = 2;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_RATE_LIMIT_WINDOW_SECONDS = 60;
```

The server action should use `enforceRateLimitForAction` or the existing action-rate-limit helper
with names scoped by actor ID and mode, for example
`action:admin-crm-forecast-backfill:dry-run:${actorId}` and
`action:admin-crm-forecast-backfill:write:${actorId}`. Rate-limited requests return the stable
`rate_limited` error code.

## Output And Rendering Contract

CRM19 renders a compact operational result derived from CRM17 aggregate output:

```ts
export type AdminCrmForecastBackfillOperatorMode = 'dry_run' | 'write';

export type AdminCrmForecastBackfillOperatorResultStatus = 'completed' | 'partial' | 'failed';

export type AdminCrmForecastBackfillOperatorUiStatus =
  | 'idle'
  | 'dry_run_pending'
  | 'ready_to_confirm'
  | 'write_pending'
  | 'result';

export interface AdminCrmForecastBackfillOperatorResult {
  mode: AdminCrmForecastBackfillOperatorMode;
  status: AdminCrmForecastBackfillOperatorResultStatus;
  tenantId: string;
  fromDate: string;
  toDate: string;
  confirmationToken: string | null;
  datesConsidered: number;
  datesCompleted: number;
  datesPartial: number;
  datesDeferred: number;
  datesFailed: number;
  workItemsConsidered: number;
  workItemsSucceeded: number;
  workItemsDeferred: number;
  workItemsFailed: number;
  snapshotsInserted: number;
  snapshotVersionConflicts: number;
  sourceRunId: string | null;
  generatedAt: string;
}
```

Export:

```ts
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_DATE_ROWS =
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS;
```

Rendering rules:

- Dry-run result shows `snapshotsInserted: 0` and a clear "ready to confirm" state when the dry-run
  status is `completed` or `partial`.
- Dry-run result with `status: 'failed'` shows failure detail and does not render a confirmation
  token or enabled write confirmation.
- Write result shows inserted snapshot counts and partial/failure counts.
- Date-level detail may be rendered only as aggregate-safe rows by `snapshotDate`, status, and
  counters, sorted by `snapshotDate` ascending and capped at
  `ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_DATE_ROWS`. It must not expose deal IDs, contact IDs,
  names, emails, phone numbers, notes, subjects, or descriptions.
- Empty/no-work results are valid and should render an aggregate no-work state, not an error.
- Failed or partial results remain visible so the operator can copy aggregate proof into an incident
  or runbook. The UI must not retry automatically.
- `generatedAt` is the server-action entry timestamp for the operation. Result timestamps use UTC ISO
  strings.

## Marker Rules

CRM19 must preserve `admin-crm-page-ready`; page readiness must not wait on a backfill request.

Export:

```ts
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX =
  'admin-crm-forecast-backfill-operator-';
```

Derived marker IDs:

- `${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}form`
- `${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}dry-run`
- `${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}confirm-write`
- `${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}result`

Branch-manager sessions must render none of these markers.

## UI And Accessibility Rules

- The operator band should be compact and operational, not a marketing card or a separate dashboard.
- Use existing admin CRM visual patterns and design-system form/button primitives.
- Use real form labels, inline validation, disabled/inert pending controls, and focus management for
  validation errors and completed results.
- The destructive write confirmation must be keyboard reachable and screen-reader clear.
- Do not rely on color alone for dry-run, write, partial, failed, or completed states.
- Preserve usable contrast in high-contrast mode, especially for the destructive write confirmation
  button and status badges.
- Respect reduced-motion preferences; no animated charts or progress effects are required.
- The UI must not render `CRON_SECRET`, authorization headers, raw stack traces, SQL errors, or
  request bodies.
- The form must not auto-submit write mode after dry-run; confirmation is a separate action.
- Localized confirmation and validation copy should use explicit keys:
  `admin-crm:backfill.dryRun.help`, `admin-crm:backfill.confirm.warning`,
  `admin-crm:backfill.confirm.expired`, `admin-crm:backfill.confirm.invalid`,
  `admin-crm:backfill.confirm.inFlight`, and `admin-crm:backfill.result.summary`.

## PII And Logging Rules

CRM19 output is aggregate-only. The UI and server action must not expose:

- contact names, full names, emails, phone numbers, descriptions, subjects, or notes;
- deal IDs, contact IDs, lead IDs, account IDs, or raw row payloads;
- raw CRM17 failure objects if they could contain repository-specific detail.

The implementation should add `assertNoAdminCrmForecastBackfillOperatorPiiKeys` or reuse the CRM17
nested PII key assertion against the UI result projection. PII regression tests must assert that
unsafe keys are rejected at every depth.

Server logs must use an aggregate-only prefix such as `[Admin CRM Forecast Backfill Operator]` and
must not log submitted request bodies, raw thrown errors containing SQL detail, or authorization
headers.

Structured logs should include only aggregate-safe fields:

- `actorId`
- `tenantId`
- `fromDate`
- `toDate`
- `mode`
- `outcome`
- `snapshotsInserted`
- `versionConflicts`
- `confirmationTokenId` when available

## Error Mapping

CRM19 should expose stable localized error states:

- `unauthorized`
- `invalid_request`
- `invalid_range`
- `range_too_large`
- `date_out_of_bounds`
- `invalid_tenant`
- `confirmation_invalid`
- `confirmation_expired`
- `confirmation_in_flight`
- `rate_limited`
- `all_dates_failed`
- `partial_failure`
- `internal_error`

The server boundary should map CRM17 typed core errors by error code or typed result fields, not by
message substrings. UI copy should explain the operator action to take without exposing internals.

## Acceptance Criteria

- Admin-like sessions can see the operator band on `/admin/crm`; branch-manager sessions cannot.
- Staff, agent, member, tenantless, and actorless sessions cannot invoke the CRM19 server boundary.
- Dry-run is required before write mode for the exact same normalized request tuple.
- Dry-run-first is enforced server-side through a signed, short-lived, single-use confirmation token.
- Changing tenant, dates, or max work-item cap invalidates write confirmation.
- Branch-manager action submissions return `unauthorized` before request validation.
- Duplicate in-flight writes for the same confirmation token return `confirmation_in_flight`.
- Write mode invokes CRM17 core directly server-side and never sends `CRON_SECRET` to the browser.
- CRM17 cron API behavior remains covered and unchanged.
- Aggregate dry-run/write results render with stable markers and no PII-shaped keys.
- Branch-manager `/admin/crm` output continues to omit CRM18/CRM19 admin-only operational controls.
- The implementation adds focused action/core/component/i18n/PII/E2E proof and program/tracker
  proof after promotion.

## Coverage Discipline

Focused tests should include:

- Server boundary: admin success, branch-manager denial before request parsing, tenantless denial,
  invalid request/range mapping, dry-run invocation, write invocation, signed confirmation-token
  generation, exact-request confirmation enforcement, token expiration, token tampering, single-use
  consumption, in-flight duplicate rejection, and rate limiting.
- Component/page: form rendering, validation copy, dry-run result, confirm-write state, write result,
  pending/inert controls, empty/no-work result, partial/failure result, and marker presence.
- PII: unsafe keys rejected at every depth of the UI result projection.
- I18n: `sq`, `en`, `sr`, and `mk` keys for labels, validation, confirmation, status, and errors.
- E2E: at least one admin `/admin/crm` smoke proving markers and dry-run-first controls, plus one
  branch-manager `/admin/crm` smoke proving CRM19 markers are absent.
- Defense-in-depth action proof: a branch-manager-session direct POST/server-action invocation returns
  `unauthorized` before request validation.
- Non-regression: existing CRM17 route/core tests remain green.

## Verification Plan

Draft-review PR verification:

```bash
git diff --check
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm verify-slice -- --static
```

Implementation PR verification after promotion:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/admin/crm/_backfill-core.test.ts' 'src/app/[locale]/admin/crm/_backfill-core.pii.test.ts' 'src/app/[locale]/admin/crm/page.test.tsx'
pnpm --filter @interdomestik/web test:unit --run src/app/api/cron/crm/forecast-snapshots/backfill/_core.test.ts src/app/api/cron/crm/forecast-snapshots/backfill/_core.pii.test.ts src/app/api/cron/crm/forecast-snapshots/backfill/route.test.ts
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

`pnpm verify-slice -- --static` runs static, docs, tracker, and scope-oriented proof. `pnpm
verify-slice -- --required-gates` adds the repository's required pre-PR gates, including
`pr:verify`, `security:guard`, and `e2e:gate`.

The implementation PR should also run `interdomestik_qa.scope_audit` with allowed paths limited to
the existing admin CRM route/action/component files, CRM17 internal helper extraction if any,
localized message files, focused E2E tests, and tracker/program proof. `apps/web/src/proxy.ts`,
schema/migrations/RLS, Vercel cron config, staff/agent/member UI, README, AGENTS.md, and broad
architecture docs must be forbidden.

Playwright MCP/browser validation is required for the implementation because CRM19 changes an
admin-facing workflow. Use Playwright MCP for browser-state snapshots and interaction proof when
available; fall back to the repo Playwright command only if MCP is blocked and the blocker is
reported. Validation should cover admin dry-run-first behavior and branch-manager marker absence on
`/admin/crm`.

## Risks

- **Secret leakage.** Avoided by forbidding browser-to-cron API calls and forbidding `CRON_SECRET`
  reads in UI/server-action serialization paths.
- **Accidental writes.** Controlled by server-enforced dry-run-first tokens, exact-request
  confirmation matching, token TTL, single-use consumption, and a separate write action.
- **Branch-manager leakage.** Controlled by the existing CRM20 route-core split and negative marker
  tests.
- **Operator over-scope.** Controlled by single-tenant, bounded date range, no all-tenant fleet
  backfill, and no run ledger.
- **Snapshot-version growth.** Accepted from CRM17 append-only semantics; UI copy must make the
  behavior explicit before write confirmation.
- **Action timeout.** First slice reuses CRM17 caps and soft-timeout behavior; no queue or background
  worker is introduced.
- **Admin action spam.** Controlled by per-actor dry-run and write rate limits.

## Review Questions

1. Should CRM19 live as a compact band on `/admin/crm`, below CRM18 observability, rather than a new
   subroute?
   - Author recommendation: yes. This preserves route authority, keeps observability and repair in
     one operational context, and avoids proxy/sidebar expansion.

2. Should write mode require a successful dry-run, or allow confirmation after a partial dry-run?
   - Author recommendation: allow confirmation after successful or partial dry-run, but not after an
     all-failed dry-run. Partial dry-run is useful when the operator intentionally wants to repair
     the dates/work-items that can be derived.

3. Should tenant selection be free-text tenant ID or an admin tenant picker?
   - Author recommendation: use a constrained text field in CRM19. A picker requires a broader
     tenant-listing UX and authorization contract; that should be a later operator-polish slice.

4. Should CRM19 store run history in the browser or database?
   - Author recommendation: no. Current-request result only. Durable run history belongs with a
     schema-reviewed run-ledger or alerting slice.

5. Should CRM19 include all-tenant fleet backfill?
   - Author recommendation: no. Single-tenant repair keeps blast radius bounded and matches CRM17.

## Promotion Boundary

This promotion PR is docs-only. It records the approved decision and promoted implementation slice,
updates `docs/plans/current-program.md` and `docs/plans/current-tracker.md`, closes the CRM17
repo-tracker sync gap with PR `#773` and merge commit
`00076c953d8b34f9e13f0f9822891404f27523f0`, and keeps implementation work out of the promotion PR.
Notion closeout sync is available and should be recorded after this promotion PR merges.

The eventual sign-off table should record CRM05, CRM12, CRM13, CRM14, CRM15, CRM16, CRM17, CRM18,
and CRM20 as completed predecessors; reserve `P38-CRM22 Forecast Snapshot Alerting` for a later
health/run-history/notification slice; keep `P38-CRM21 Visual Regression Baseline`, `P38-CRM08`,
`P38-CRM09`, `P38-CRM10`, and `P38-CRM11` reserved.

CRM06 and CRM07 remain completed parallel-track dedupe/routing foundations for P38. They are not
direct predecessors for CRM19's forecast snapshot operator workflow, but the promotion PR may include
a sign-off footnote acknowledging them to keep the broader P38 audit chain explicit.
