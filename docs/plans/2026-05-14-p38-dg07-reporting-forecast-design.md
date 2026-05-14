# P38-DG07 Reporting And Forecast Snapshot Design Review

Status: `design-review`  
Date: `2026-05-14`  
Slice: `P38-DG07`  
Owner: `platform + product + qa`  
Phase: `Phase C`

## Status / Predecessor Closeout

`P38-CRM04 Pipeline And Deal Persistence` is complete through PR `#754`, merge commit
`40a3e15221d473086a8746f5905385d3cf9e4678`. The post-merge tracker closeout is complete through
PR `#755`, merge commit `a60367ac2e5b4ebb39ecd27f38ee50e67f01f731`.

CRM04 added additive pipeline, stage, loss-reason, deal stage-history, deal quarantine, and
normalized nullable deal persistence; app-side SQL adapters for the CRM03 domain ports; transactional
deal/history writes; legacy mirror compatibility; RLS coverage for the new tenant CRM tables; and
focused adapter proof. It preserved web UI, proxy, canonical routes, auth/tenancy architecture,
reporting read-models, forecast snapshots, routing persistence, Stripe, README, AGENTS, and broad
architecture docs.

This gate closes the stale post-CRM04 design gap: the durable stage-history substrate now exists, so
reporting no longer needs to infer funnel, velocity, or forecast from legacy `crm_deals.stage` text.

## Decision

The next bounded implementation slice is:

`P38-CRM05 Reporting Read-Models And Forecast Snapshots`

This slice is selected because professional CRM dashboards require aggregate read models over durable
pipeline, stage, deal, and stage-history data before UI expansion is credible. CRM05 should define the
reporting contract and persistence adapters first; dashboard widgets can consume those contracts in
later, separately promoted UI slices.

Routing persistence remains reserved as `P38-CRM08`, but it should not jump ahead of reporting now
that CRM04 has landed. CRM07 already provides a pure advisory routing selector; CRM05 is the more
direct dashboard-professionalism unlock.

## Inputs

| Input                                | Relevance                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `P38-CRM04` / PR `#754`              | Provides normalized pipelines, stages, deals, loss reasons, and append-only deal stage history.                    |
| `P38-CRM03` / PR `#747`              | Provides domain deal/pipeline contracts, forecast category semantics, loss reason contracts, and deal next action. |
| `packages/domain-crm/src/dashboards` | Existing pure read-side dashboard mapper pattern to preserve for CRM reporting.                                    |
| `apps/web/src/lib/domain-crm/*`      | Established app-side SQL adapter boundary for CRM domain ports and read models.                                    |
| `P38-DG06` reserved CRM05 sequencing | Explicitly blocked reporting until normalized persistence landed; that blocker is now removed.                     |
| Phase C repository rules             | Preserve proxy authority, canonical routes, auth layering, tenancy architecture, and clarity-marker contracts.     |

## Design Review

| Rank | Candidate                                          | Decision                                                                                                                             |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P38-CRM05 Reporting Read-Models And Forecasts`    | Promote now. It consumes CRM04 durable persistence and unlocks credible weighted pipeline, velocity, funnel, and forecast reporting. |
| 2    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Useful, but less blocking for professional dashboards than reporting over normalized deal history.                            |
| 3    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires normalized readers and reporting confidence before legacy deal mirrors are retired.                                  |
| 4    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence after CRM04 data has settled.                                  |
| 5    | Tasks, templates, sequences, activity channels     | Defer. These P1 productivity slices amplify the CRM after the core dashboard substrate exists.                                       |

## Promoted Slice

`P38-CRM05 Reporting Read-Models And Forecast Snapshots`

Implementation scope:

- Add `packages/domain-crm/src/reporting` with pure read-model functions and typed row shapes.
- Export reporting contracts from `packages/domain-crm/src/index.ts` without importing SQL,
  `drizzle-orm`, app code, or database schema into the domain package.
- Add app-side reporting repository adapters under `apps/web/src/lib/domain-crm` that read CRM04
  normalized persistence and return typed reporting row shapes to the domain read models.
- Add additive Drizzle schema and migration artifacts for append-only `crm_pipeline_snapshots`.
- Add a forecast snapshot repository/port boundary that records daily snapshot rows without adding a
  scheduler, cron job, dashboard widget, or external worker.
- Add focused in-memory domain tests and SQL adapter tests for tenant, branch, role, time-window,
  nullability, currency, and snapshot-version behavior.
- Update tracker/program proof only as needed.

Allowed touch points:

- `packages/domain-crm/src/reporting/**`.
- `packages/domain-crm/src/index.ts`.
- `apps/web/src/lib/domain-crm/**` for reporting and forecast snapshot adapters and focused tests.
- `packages/database/src/schema/crm.ts`.
- `packages/database/src/schema/relations.ts` only for forecast snapshot relations.
- `packages/database/drizzle/**` for generated migration artifacts and journal updates.
- `docs/plans/**` for proof and tracker/program state.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical `/member`, `/agent`, `/staff`, or `/admin` routes.
- Auth provider layering, session shape, route authority, or tenancy architecture.
- Dashboard UI, widgets, pages, navigation, clarity markers, or E2E selectors.
- Routing persistence, routing admin UX, ownership transfer persistence, notification fanout, outbox
  worker persistence, external sync, tasks, templates, sequences, scoring, consent, enrichment,
  search, retention, workflow automation, or broad CRM redesign.
- Legacy deal column retirement or CRM04 NOT NULL/FK tightening.
- Stripe, README, AGENTS, or broad architecture docs.

## Domain Contract

CRM05 must add a `reporting/` domain namespace with explicit types and pure derivations.

Required read-model functions:

- `deriveCrmFunnelConversion(rows, input)`:
  returns per-stage entered count, exited count, won count, lost count, conversion rate, and drop-off
  rate over a bounded window.
- `deriveCrmStageVelocity(rows, input)`:
  returns average, median, minimum, maximum, and sample count of days spent per stage, excluding open
  intervals unless explicitly requested.
- `deriveCrmSourceBreakdown(rows, input)`:
  returns lead/deal count, won count, lost count, win rate, raw value, and weighted value grouped by
  source/UTM dimensions supplied by the repository.
- `deriveCrmWinRate(rows, input)`:
  returns won/lost/open counts and win rate grouped by agent, branch, source, or pipeline.
- `deriveCrmAgentLeaderboard(rows, input)`:
  returns rankable rows with agent id, branch id, open pipeline value, weighted pipeline value,
  closed-won value, won count, lost count, activity-safe labels supplied by the adapter, and stable
  tie-break fields.
- `deriveCrmWeightedPipeline(rows, input)`:
  returns open deal value multiplied by stage probability, grouped by pipeline, stage, branch, agent,
  forecast category, and currency.
- `deriveCrmForecastSnapshot(input)`:
  converts weighted-pipeline rows into an append-only daily snapshot payload.

The domain package owns math, grouping, normalization of empty buckets, percentage rounding, and
window validation. The app/database adapter owns SQL, tenant scoping, joins, and row extraction.

## Reporting Type Rules

- Time windows use `{ from: string; to: string }` ISO timestamps, with `from` inclusive and `to`
  exclusive.
- The first slice caps reporting windows at `400` days via exported
  `CRM_REPORTING_MAX_WINDOW_DAYS`.
- Stage velocity uses decimal days rounded to two decimals via exported
  `CRM_REPORTING_DURATION_DECIMAL_PLACES = 2`.
- Percentage outputs are integer basis points (`0` to `10000`) via exported
  `CRM_REPORTING_PERCENT_DENOMINATOR = 10000`.
- Row limits are exported constants, including `CRM_REPORTING_MAX_GROUP_ROWS = 250` and
  `CRM_REPORTING_MAX_LEADERBOARD_ROWS = 100`.
- Monetary values are always minor units and grouped by `currencyCode`. CRM05 must not convert
  currencies or sum across currencies.
- Rows with null `currencyCode`, null `valueAmountMinor`, null `pipelineId`, or null
  `currentStageId` are excluded from monetary or stage-specific metrics and counted in explicit
  `excluded*Count` fields.
- Archived deals, archived pipelines, and archived stages are excluded by default unless an input
  explicitly allows archived rows for administrative audit.
- Lost-stage metrics must carry `lossReasonId` when present but must not require loss reason display
  names in the domain layer.

## Authorization And Privacy

Reporting access uses `CrmActorContext` and returns typed denial reasons.

Required denial union:

`tenant_scope | role_scope | branch_scope | agent_scope | window_scope | unsupported_grouping`

Authorization defaults:

- `admin` and staff-like actors may read tenant-wide aggregate reporting.
- Branch managers may read only their branch scope.
- Agents may read only their own agent-scoped aggregate rows unless a later gate grants wider branch
  visibility.
- Member actors are denied.
- Every repository query must carry `tenantId`; branch and agent filters are mandatory when the actor
  requires them.
- CRM05 reporting outputs aggregate rows only. Candidate contact names, email, phone, notes, raw
  activity descriptions, and other PII must not be returned by reporting read models.

## Forecast Snapshot Persistence Contract

CRM05 may add `crm_pipeline_snapshots` as an append-only table.

Required columns:

- `id`
- `tenant_id`
- nullable `branch_id`
- `pipeline_id`
- `snapshot_date` as `date`
- `snapshot_version` as integer, starting at `1` per tenant/pipeline/branch/currency/date key
- `currency_code`
- `open_deal_count`
- `raw_value_amount_minor`
- `weighted_value_amount_minor`
- `forecast_pipeline_amount_minor`
- `forecast_best_amount_minor`
- `forecast_commit_amount_minor`
- `forecast_omitted_amount_minor`
- nullable `source_run_id`
- nullable `idempotency_key`
- nullable `metadata jsonb`
- `created_at`
- nullable `created_by_id`

Persistence rules:

- Snapshots are append-only. Application code must not update or delete existing snapshot rows.
- Re-running a snapshot for the same tenant, pipeline, branch, currency, and date creates the next
  `snapshot_version`.
- Querying snapshots defaults to the latest version per key.
- Unique index:
  `(tenant_id, pipeline_id, branch_id, currency_code, snapshot_date, snapshot_version)`.
- Reporting indexes:
  `(tenant_id, snapshot_date)`, `(tenant_id, pipeline_id, snapshot_date)`, and
  `(tenant_id, branch_id, snapshot_date)`.
- Composite tenant FKs are required for pipeline references.
- Scheduled generation is out of scope; CRM05 only adds the derivation and repository boundary.

## Adapter Contract

The app-side reporting adapter must:

- Read from CRM04 normalized `crm_deals`, `crm_pipelines`, `crm_pipeline_stages`,
  `crm_deal_stage_history`, and `crm_loss_reasons` where needed.
- Prefer CRM04 normalized fields over legacy `crm_deals.stage` and never derive stage metrics from
  legacy text.
- Scope every query by tenant and actor-derived branch/agent filters before rows reach the domain
  read-model functions.
- Return typed row shapes with stable IDs, timestamps, probability values, forecast categories,
  value minor units, currency codes, source/UTM fields when available, and exclusion counters.
- Use explicit SQL ordering for deterministic leaderboard and snapshot rows.
- Keep existing dashboard repositories behavior-compatible; CRM05 must not replace current dashboard
  DTOs or UI data paths unless a focused adapter test proves unchanged output.
- Include `db-access-guard` comments for new tenant-scoped queries if the existing guard requires
  them.

## Acceptance Criteria For P38-CRM05

- `packages/domain-crm/src/reporting` exports typed row shapes, input types, denial reasons,
  repository ports, and pure read-model functions.
- Domain tests cover every `success | forbidden | invalid_input` branch introduced by reporting.
- Domain tests cover zero-row outputs, null exclusion counters, multi-currency grouping, window
  validation, percentage math, median velocity, and stable leaderboard tie-breaks.
- Database schema exports `crm_pipeline_snapshots` with append-only versioning constraints and
  tenant-scoped references.
- App-side SQL adapters read CRM04 normalized persistence and do not import legacy stage text for
  reporting metrics.
- Forecast snapshot adapter tests prove first-version insert, same-day re-run version increment,
  latest-version reads, tenant isolation, branch isolation, and idempotency-key reservation.
- No SQL or `drizzle-orm` imports appear under `packages/domain-crm/src`.
- No dashboard UI, proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad
  architecture-doc changes appear in the slice.

### Coverage Discipline

Every report function must have a dedicated test for empty input, mixed tenant/branch/agent-shaped
rows, null normalized CRM04 fields, and at least one non-trivial aggregation. Snapshot persistence
must have transaction-level proof that the chosen version is written consistently when a same-day
snapshot already exists. Any adapter branch that excludes rows from monetary or stage-specific
metrics must expose an explicit exclusion counter and test it.

## Verification Plan

Focused implementation proof:

- `pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/domain-crm`
- `pnpm --filter @interdomestik/database type-check`
- `pnpm db:migrations:check-journal`
- `pnpm check:db-access`
- `pnpm exec prettier --check packages/domain-crm/src/reporting 'apps/web/src/lib/domain-crm/**/*.ts' packages/database/src/schema/crm.ts packages/database/src/schema/relations.ts 'docs/plans/**/*.md'`
- `interdomestik_qa.scope_audit` with allowed paths limited to `packages/domain-crm`,
  `apps/web/src/lib/domain-crm`, `packages/database`, and `docs/plans`; forbidden paths must include
  `apps/web/src/proxy.ts`, `README.md`, `AGENTS.md`, and `docs/ARCHITECTURE.md`.

Required proof before implementation PR merge:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Risks And Deferred Decisions

- **Null normalized CRM04 rows.** Backfilled rows may still have null normalized fields. CRM05 must
  exclude and count them, not guess pipeline, stage, or currency.
- **Multi-currency reporting.** CRM05 groups by currency and does not convert currencies. FX
  conversion requires a later finance/forecast gate.
- **Snapshot scheduling.** CRM05 records the table, derivation, and adapter boundary. Cron/worker
  scheduling remains deferred.
- **Dashboard UI timing.** CRM05 should not change widgets. Later dashboard slices can consume the
  reporting ports once proven.
- **Stage-history semantics.** CRM05 depends on CRM04 `kind` values to distinguish created,
  stage-changed, won, lost, and reopened events; it must not infer those states from text labels.
- **Leaderboard fairness.** First-slice leaderboard rows are descriptive aggregates, not quota or
  compensation truth. Goals/quotas remain a later P2 item.
- **Legacy deal retirement.** CRM05 may reduce reliance on legacy stage text for reporting, but
  CRM10 remains the reserved retirement gate.

## Dependency / Sequencing

This slice unblocks:

- Future agent/admin dashboard widgets for weighted pipeline, funnel conversion, stage velocity, win
  rate, source mix, and leaderboard views.
- Future forecast delta views such as pipeline added, slipped, closed, and omitted over a week.
- Future CRM10 legacy deal column retirement evidence, because normalized reporting can replace
  legacy-stage-derived dashboard counters.

This slice does not unblock or authorize routing persistence, routing admin UX, task/sequences
automation, activity-channel specialization, scoring, consent, enrichment, search, retention,
workflow automation, or dashboard UI redesign by itself.

## Non-Goals

- No dashboard UI, widget, page, route, or clarity-marker changes.
- No proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc
  changes.
- No scheduled snapshot job, cron automation, outbox worker, notification fanout, or external sync.
- No legacy deal column retirement.
- No NOT NULL/FK tightening of CRM04 nullable deal columns.
- No cross-currency conversion.
- No PII-returning report details.

## Promotion Boundary

Merging this design gate authorizes `P38-CRM05 Reporting Read-Models And Forecast Snapshots` only.
Dashboard UI, scheduled snapshot generation, routing persistence, routing admin UX, legacy deal
column retirement, deal nullability tightening, and broad CRM redesign require later design gates.

## Promotion / Sign-off

| Slice                                                    | Status   | Authority  | Notes                                                                 |
| -------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------- |
| `P38-CRM04 Pipeline And Deal Persistence`                | complete | PR `#754`  | Merge commit `40a3e15221d473086a8746f5905385d3cf9e4678`.              |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | promoted | `P38-DG07` | Domain reporting read-models, SQL adapters, and forecast snapshots.   |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | post-CRM05 | Still valid, but not selected ahead of reporting after CRM04.         |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-CRM08 | Requires routing persistence first.                                   |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | post-CRM05 | Requires normalized reporting/readers before legacy mirrors are cut.  |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate | Requires production zero-null evidence and backfill confidence first. |
