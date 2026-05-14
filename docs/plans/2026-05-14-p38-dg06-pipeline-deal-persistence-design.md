# P38-DG06 Pipeline And Deal Persistence Design Review

Status: `design-review`  
Date: `2026-05-14`  
Slice: `P38-DG06`  
Owner: `platform + product + qa`  
Phase: `Phase C`

## Status / Predecessor Closeout

`P38-CRM07 Lead Routing Domain Foundation` is complete through PR `#751`, merge commit
`dce513248cee825ae5e7d616f17c489a80422a1e`.

This gate closes the stale live-tracker state that still showed `P38-CRM07` as in progress. CRM07
added the domain-only routing selector, rule/workload/cursor/audit contracts, explicit
dedupe-state eligibility, `crm.lead.routed` outbox support, and required-gate proof. It did not add
schema, SQL adapters, web UI, ownership-transfer persistence, notification fanout, proxy, route,
auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc changes.

## Decision

The next bounded implementation slice is:

`P38-CRM04 Pipeline And Deal Persistence`

This gate returns to the reserved pipeline/deal persistence slot because `P38-CRM03` already proved
the domain aggregate, but the app still persists deals through the legacy `crm_deals.stage` text
shape and has no durable `crm_pipelines`, `crm_pipeline_stages`, `crm_deal_stage_history`, or
`crm_loss_reasons` tables. Reporting and forecast snapshots remain blocked until that persistence
contract exists.

Routing persistence remains reserved as `P38-CRM08`, but it is not the next slice. CRM07 is already
useful as a pure advisory selector; durable pipeline/deal persistence is now the larger blocker for
professional dashboards.

## Inputs

| Input                                 | Relevance                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P38-CRM03` / PR `#747`               | Added `packages/domain-crm/src/pipelines` and `packages/domain-crm/src/deals`, including repository ports, stage history, forecast, and loss reason contracts. |
| Existing `crm_deals` table            | Still carries legacy `stage`, `status`, `value_cents`, `lead_id`, and `membership_plan_id` without pipeline/stage foreign keys or append-only stage history.   |
| Existing app-side deal reads          | Agent dashboard and lead-detail adapters read `crmDeals` directly, using `stage = 'closed_won'` and legacy lead joins for branch custody.                      |
| `P38-CRM02` account/contact contracts | Deal domain creation expects account/contact references, but persistence must bridge legacy lead-linked deals without broad account migration.                 |
| `P38-CRM01` outbox contract           | Deal mutation adapters can enqueue typed events only after durable write/adapters exist; worker fanout remains deferred.                                       |
| `P38-CRM07` closeout                  | Routing domain foundation is complete and no longer blocks returning to the reserved persistence sequence.                                                     |

## Design Review

| Rank | Candidate                                          | Decision                                                                                                                                        |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM04 Pipeline And Deal Persistence`          | Promote now. It is the reserved post-CRM03 slice and is required before weighted pipeline, velocity, forecast, and loss reporting are credible. |
| 2    | `P38-CRM05 Reporting Read-Models And Forecasts`    | Keep reserved. Reporting should consume durable pipeline/stage/history data rather than legacy `stage` text.                                    |
| 3    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. CRM07 domain selection is useful without persistence; routing cursor/schema work is less urgent than the dashboard data model blocker.   |
| 4    | Tasks, templates, sequences, activity channels     | Defer. These P1 slices depend on CRM foundations but do not unblock dashboard professionalism first.                                            |
| 5    | Scoring, consent, enrichment, search, workflows    | Defer. These need richer persisted CRM aggregates or outbound policy before implementation.                                                     |

## Promoted Slice

`P38-CRM04 Pipeline And Deal Persistence`

Implementation scope:

- Add Drizzle schema for `crm_pipelines`, `crm_pipeline_stages`, `crm_deal_stage_history`, and
  `crm_loss_reasons`.
- Add the minimum compatible columns to `crm_deals` for the domain contract: `account_id`,
  nullable `contact_id`, `branch_id`, `pipeline_id`, `current_stage_id`, `expected_close_at`,
  `forecast_category`, `currency_code`, `value_amount_minor`, nullable `loss_reason_id`,
  `archived_at`, and `archived_by_id`.
- Keep existing legacy `crm_deals.lead_id`, `membership_plan_id`, `value_cents`, `stage`, `status`,
  and `closed_at` readable during the migration window.
- Backfill a default tenant/branch-compatible pipeline and stage mapping for the legacy deal stages:
  `proposal`, `negotiation`, `closed_won`, and `closed_lost`.
- Backfill `current_stage_id`, `pipeline_id`, `forecast_category`, `currency_code`,
  `value_amount_minor`, `branch_id`, and initial `crm_deal_stage_history` rows for existing deals
  where enough tenant/lead custody data exists.
- Add SQL adapters under `apps/web/src/lib/domain-crm` implementing the `CrmPipelineRepository`,
  `CrmDealRepository`, and `LossReasonResolver` ports from `packages/domain-crm`.
- Preserve the domain package boundary: do not import `drizzle-orm` or database schema from
  `packages/domain-crm`.
- Add focused adapter/schema proof and keep existing dashboard and lead-detail output behavior
  compatible during the migration window.

Allowed touch points:

- `packages/database/src/schema/crm.ts`.
- `packages/database/src/schema/relations.ts` only for CRM persistence relations.
- `packages/database/drizzle/**` for generated or hand-authored migration artifacts and journal
  updates.
- `apps/web/src/lib/domain-crm/**` for pipeline/deal SQL adapters and focused adapter tests.
- Existing CRM dashboard and lead-detail repository tests only where legacy deal-read compatibility
  must be adjusted.
- `docs/plans/**` for proof and tracker/program state.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical `/member`, `/agent`, `/staff`, or `/admin` routes.
- Auth provider layering, session shape, route authority, or tenancy architecture.
- Web UI, dashboard widgets, lead-list controls, routing UI, notifications, workers, or external
  sync.
- `packages/domain-crm/src/{pipelines,deals}` behavior except for non-breaking type exports if the
  adapter contract proves a missing exported type.
- Reporting read-models, forecast snapshots, routing persistence, routing admin UX, tasks,
  templates, sequences, scoring, consent, enrichment, search, retention, workflow automation, or
  broad CRM redesign.
- Stripe, README, AGENTS, or broad architecture docs.

## Persistence Contract

The implementation must pin these database-level contracts:

- `crm_pipelines` is tenant-scoped, optionally branch-scoped, soft-archivable, and has a unique
  active name per `(tenant_id, branch_id)` where practical.
- `crm_pipeline_stages` belongs to one pipeline, carries `order`, `probability`, `is_won`,
  `is_lost`, and nullable `expected_duration_days`, and prevents a stage from being both won and
  lost.
- Each active pipeline has exactly one won stage and at least one lost stage after backfill. If this
  cannot be expressed as a simple database constraint, the adapter must preserve the domain
  validation and migration must seed valid defaults.
- `crm_loss_reasons` is tenant-scoped, code-based, soft-archivable, and only valid for lost-stage
  transitions.
- `crm_deal_stage_history` is append-only and records tenant, deal, from stage, to stage, actor,
  loss reason, free-text reason, and occurred/created timestamp. Updates and deletes are out of
  scope for application code.
- `crm_deals.current_stage_id` references `crm_pipeline_stages.id`; `crm_deals.pipeline_id`
  references `crm_pipelines.id`; `crm_deals.loss_reason_id` references `crm_loss_reasons.id`.
- `crm_deals.forecast_category` is constrained to `pipeline | best | commit | omitted | closed`.
- `crm_deals.currency_code` is constrained to three uppercase letters and
  `value_amount_minor` is a non-negative integer.
- Tenant isolation is explicit on every table and every adapter query. Cross-tenant foreign-key
  holes must be closed with composite unique keys or adapter-level tenant checks where Postgres
  composite references are not practical in this slice.

## Compatibility Policy

CRM04 must be additive first:

- Existing app reads that depend on `crm_deals.stage = 'closed_won'` continue to work.
- New domain adapters read and write the normalized pipeline/stage fields.
- Deal create/update through the new adapter must write a legacy-compatible `stage`, `status`,
  `value_cents`, and `closed_at` mirror while legacy readers still exist.
- Legacy deal reads may be updated to prefer normalized fields only if the visible DTO/output stays
  unchanged and focused tests pin compatibility.
- Removal of legacy `crm_deals.stage`, `status`, or `value_cents` is out of scope.

## Adapter Contract

The app-side SQL adapters must preserve the `domain-crm` ports/adapters split:

- `pipeline-repository.ts` maps `crm_pipelines` plus ordered `crm_pipeline_stages` to
  `CrmPipeline`.
- `deal-repository.ts` maps normalized `crm_deals` rows plus stage-history writes to
  `CrmDealRepository`.
- `loss-reason-repository.ts` or an equivalent focused adapter implements `LossReasonResolver`.
- Deal stage movement must update `crm_deals` and append `crm_deal_stage_history` in one database
  transaction.
- Deal creation must insert `crm_deals` and the initial `crm_deal_stage_history` row in one
  database transaction.
- Idempotency keys remain reserved at the domain input/event layer; adapter-level
  `crm_idempotency_keys` enforcement is deferred unless an existing repository helper can be reused
  without widening scope.
- Outbox table persistence and workers remain out of scope; adapters return the typed domain event
  to callers as the existing domain mutations already do.

## Migration / Backfill Policy

The migration must be reversible enough for review and deterministic enough for CI:

- Seed a default pipeline per tenant or tenant-branch scope using the existing legacy stage set.
- Map `proposal` and `negotiation` to non-terminal stages, `closed_won` to the won stage, and
  `closed_lost` to the lost stage.
- Backfill branch custody from the joined `crm_leads.branch_id`; rows without usable branch custody
  must be left explicitly detectable rather than silently guessed.
- Backfill `value_amount_minor` from `value_cents` and use `EUR` as the first default currency
  unless the existing row already carries a better currency source.
- Backfill `forecast_category = 'closed'` for terminal legacy deals and `pipeline` for open legacy
  deals.
- Backfill one initial stage-history row per legacy deal with `from_stage_id = null`,
  `to_stage_id = current_stage_id`, and a deterministic migration actor marker if no real actor is
  available.
- Data cleanup, full account/contact conversion backfill, and legacy column retirement require later
  gates.

## Acceptance Criteria For P38-CRM04

- Database schema exports the new pipeline, stage, deal stage-history, and loss-reason tables.
- `crm_deals` carries normalized pipeline/deal columns while preserving legacy columns.
- Drizzle migration artifacts and journal checks pass.
- SQL adapters implement the existing `CrmPipelineRepository`, `CrmDealRepository`, and
  `LossReasonResolver` contracts.
- Adapter tests prove tenant scope, branch scope, ordered stage loading, archived pipeline/stage
  filtering, loss-reason resolution, atomic deal creation plus history append, atomic stage movement
  plus history append, and legacy mirror compatibility.
- Existing agent dashboard and lead-detail deal reads remain behavior-compatible.
- No SQL or `drizzle-orm` imports appear under `packages/domain-crm/src`.
- No web UI, proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad
  architecture-doc changes appear in the slice.

### Coverage Discipline

Every adapter `success | forbidden | invalid_input | not_found` branch introduced by CRM04 must have
focused proof. Every transaction path must have at least one test showing the history row and deal row
are written together. Every compatibility mirror field must have a test before existing legacy reads
are allowed to depend on the new write path.

## Verification Plan

Focused implementation proof:

- `pnpm --filter @interdomestik/database type-check`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/domain-crm`
- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm db:migrations:check-journal`
- `pnpm check:db-access`
- `pnpm exec prettier --check packages/database/src/schema/crm.ts packages/database/src/schema/relations.ts 'apps/web/src/lib/domain-crm/**/*.ts' 'docs/plans/**/*.md'`
- `interdomestik_qa.scope_audit` with allowed paths limited to `packages/database`,
  `apps/web/src/lib/domain-crm`, and `docs/plans`; forbidden paths must include
  `apps/web/src/proxy.ts`.

Required proof before implementation PR merge:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Risks And Deferred Decisions

- **Legacy deal identity.** CRM04 should reuse existing `crm_deals.id`; introducing a parallel deal
  table would fragment existing lead-detail and dashboard reads.
- **Account/contact persistence mismatch.** Domain deals reference account/contact IDs, while legacy
  rows are lead-linked. CRM04 may allow nullable account/contact during backfill, but new domain
  writes should require account references through the domain mutation contract.
- **Composite tenant references.** Some current tables have single-column foreign keys. CRM04 must
  avoid cross-tenant joins through adapter checks or composite constraints where feasible.
- **Pipeline defaults.** A synthesized default pipeline is acceptable for migration. Tenant-custom
  pipeline management UI is deferred.
- **Outbox persistence.** Typed events already exist, but durable outbox table/worker fanout is not
  part of CRM04.
- **Reporting timing.** CRM05 must wait until normalized persistence lands; it should not build
  funnel/velocity read-models over legacy `stage` text.
- **Legacy retirement.** Removing or renaming existing deal columns is deferred until all active
  readers/writers are migrated.

## Dependency / Sequencing

This slice unblocks:

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`, including funnel conversion, stage
  velocity, source breakdown, win rate, leaderboard inputs, weighted pipeline, and daily forecast
  snapshots.
- Future dashboard professionalism work for agent/admin pipeline views.
- Future deal merge and account health views that need normalized account/contact/deal references.

This slice does not unblock or authorize routing persistence, routing admin UX, tasks, templates,
sequences, activity channel specializations, scoring, consent, enrichment, search, retention,
workflow automation, or UI redesign.

## Non-Goals

- No web UI or dashboard widget changes.
- No proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc
  changes.
- No outbox worker or external event fanout.
- No reporting read-models or forecast snapshots before CRM04 lands.
- No deletion or retirement of legacy deal columns.
- No full account/contact backfill beyond what the deal adapter requires for safe new writes.

## Promotion Boundary

Merging this design gate authorizes `P38-CRM04 Pipeline And Deal Persistence` only. Reporting,
forecast snapshots, dashboard UI, routing persistence, routing admin UX, outbox worker persistence,
legacy column retirement, and broad CRM redesign require later design gates.

## Promotion / Sign-off

| Slice                                                    | Status   | Authority                | Notes                                                                 |
| -------------------------------------------------------- | -------- | ------------------------ | --------------------------------------------------------------------- |
| `P38-CRM07 Lead Routing Domain Foundation`               | complete | PR `#751`                | Merge commit `dce513248cee825ae5e7d616f17c489a80422a1e`.              |
| `P38-CRM04 Pipeline And Deal Persistence`                | promoted | `P38-DG06`               | Schema and app-side SQL adapters for the CRM03 domain contracts.      |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | reserved | post-persistence         | Still blocked until CRM04 normalized persistence lands.               |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | post-routing-domain      | Still valid, but not selected ahead of the dashboard data-model need. |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing-persistence | Requires routing persistence first.                                   |
