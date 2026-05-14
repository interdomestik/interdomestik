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

Amendment note: this design was tightened after persistence-specific review to pin nullability,
migration staging, lock posture, index requirements, invariant enforcement layers, foreign-key
policy, quarantine mechanics, compatibility mirrors, and concurrency proof before `P38-CRM04`
implementation starts.

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
- Add the CRM04 columns as additive nullable columns first. `account_id`, `branch_id`,
  `pipeline_id`, `current_stage_id`, `forecast_category`, `currency_code`, and
  `value_amount_minor` remain nullable in CRM04 and may be tightened only after a later
  `P38-CRM11 Deal Nullability Tightening` gate proves production has zero nulls. `contact_id`,
  `expected_close_at`, `loss_reason_id`, `archived_at`, and `archived_by_id` remain nullable
  permanently.
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

Migration staging:

- CRM04 may add schema and nullable columns in one migration.
- Backfill must be idempotent and separate from the schema-add migration, either as a checked-in
  migration step or a checked-in script invoked by the migration runbook.
- NOT NULL tightening and stricter FK tightening are explicitly deferred to
  `P38-CRM11 Deal Nullability Tightening`.
- Rollback must drop new CRM04 columns and tables in reverse foreign-key order while leaving all
  legacy deal columns untouched.
- Forward compatibility during the deploy window is required: legacy readers must keep working while
  the new nullable columns are still null.

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

## Nullability Plan

| Column                                                                                              | CRM04 nullability     | Later tightening policy                                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `crm_deals.account_id`                                                                              | nullable              | Tighten only after CRM11 proves zero nulls and account backfill safety.                    |
| `crm_deals.branch_id`                                                                               | nullable              | Tighten only after CRM11 proves every deal has durable branch custody.                     |
| `crm_deals.pipeline_id`                                                                             | nullable              | Tighten only after CRM11 proves every deal has a normalized pipeline.                      |
| `crm_deals.current_stage_id`                                                                        | nullable              | Tighten only after CRM11 proves every deal has a normalized current stage.                 |
| `crm_deals.forecast_category`                                                                       | nullable              | Tighten only after CRM11 proves every deal has a normalized forecast category.             |
| `crm_deals.currency_code`                                                                           | nullable              | Tighten only after CRM11 proves every deal has verified currency.                          |
| `crm_deals.value_amount_minor`                                                                      | nullable              | Tighten only after CRM11 proves every deal has a normalized value or explicit zero value.  |
| `crm_deals.contact_id`, `expected_close_at`, `loss_reason_id`, `archived_at`, `archived_by_id`      | nullable permanently  | No tightening planned.                                                                     |
| `crm_deal_stage_history.pipeline_id`, `kind`, `to_stage_id`, `actor_id`, `occurred_at`, `tenant_id` | non-null for new rows | Required when history rows are written; backfill must quarantine rows that cannot satisfy. |
| `crm_deal_stage_history.idempotency_key`, `metadata`, `loss_reason_id`, `reason`, `from_stage_id`   | nullable permanently  | No tightening planned.                                                                     |

## Persistence Contract

The implementation must pin these database-level contracts. Anything not explicitly authorized here
or in Implementation Scope is covered by Non-Goals.

| Invariant                                                                                        | Enforcement layer                                                                                   |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ | ------- | -------- | --------- |
| `crm_pipelines` is tenant-scoped, optionally branch-scoped, and soft-archivable.                 | DB columns plus adapter query filters excluding archived rows by default.                           |
| Active pipeline names are unique per `(tenant_id, branch_id)`.                                   | Partial unique index where `archived_at is null`, treating tenant-wide pipelines consistently.      |
| Pipeline stages belong to one pipeline and carry order/probability/terminal metadata.            | Composite FK `(tenant_id, pipeline_id)` plus DB columns.                                            |
| Stage probability is between `0` and `100`.                                                      | DB CHECK.                                                                                           |
| A stage cannot be both won and lost.                                                             | DB CHECK `not (is_won and is_lost)`.                                                                |
| Exactly one won stage per pipeline.                                                              | Partial unique index on `(tenant_id, pipeline_id)` where `is_won = true and archived_at is null`.   |
| At least one lost stage per active pipeline.                                                     | Adapter/domain validation; no clean first-slice DB constraint.                                      |
| Forecast category is `pipeline                                                                   | best                                                                                                | commit | omitted | closed`. | DB CHECK. |
| `currency_code` matches `^[A-Z]{3}$`.                                                            | DB CHECK.                                                                                           |
| `value_amount_minor >= 0`.                                                                       | DB CHECK.                                                                                           |
| `expected_close_at` preserves absolute time semantics.                                           | `timestamp with time zone`; nullable permanently.                                                   |
| Tenant isolation on every new reference.                                                         | Composite unique `(tenant_id, id)` on every new table plus composite FKs for every new reference.   |
| `crm_deals.pipeline_id`, `current_stage_id`, and `loss_reason_id` never cross tenant boundaries. | Composite FKs mirroring the existing `crm_activities_tenant_lead_fk` pattern in `crm.ts`.           |
| `loss_reason_id` is only used for lost-stage transitions.                                        | Adapter/domain validation.                                                                          |
| Stage archive cannot orphan open deals.                                                          | Adapter refuses stage archive while any non-archived deal references the stage as `currentStageId`. |
| Archived rows are hidden by default.                                                             | Adapter `findById`/list methods exclude archived rows unless `includeArchived: true` is passed.     |

`crm_deal_stage_history` must include `id`, `tenant_id`, `deal_id`, denormalized `pipeline_id`,
`from_stage_id`, `to_stage_id`, `kind`, `actor_id`, nullable `loss_reason_id`, nullable `reason`,
nullable `idempotency_key`, nullable `metadata jsonb`, `occurred_at`, and `created_at`. `kind` is the
closed union `created | stage_changed | won | lost | reopened`. History is append-only; application
code must not update or delete rows.

Foreign-key policy:

- `crm_pipeline_stages.pipeline_id -> crm_pipelines.id`: `ON DELETE CASCADE`.
- `crm_deals.pipeline_id -> crm_pipelines.id`: `ON DELETE RESTRICT`.
- `crm_deals.current_stage_id -> crm_pipeline_stages.id`: `ON DELETE RESTRICT`.
- `crm_deal_stage_history.deal_id -> crm_deals.id`: `ON DELETE RESTRICT` for audit immutability.
- `crm_deals.loss_reason_id -> crm_loss_reasons.id`: `ON DELETE RESTRICT`.
- Composite tenant FKs are required wherever both sides carry `tenant_id`.

## Index Plan

CRM04 must add or document these indexes:

- `crm_pipelines (tenant_id, archived_at)`.
- Partial unique active pipeline name index on `(tenant_id, branch_id, name)` where
  `archived_at is null`.
- `crm_pipeline_stages (tenant_id, pipeline_id, "order")`.
- Partial unique `crm_pipeline_stages (tenant_id, pipeline_id, "order") where archived_at is null`.
- Partial unique `crm_pipeline_stages (tenant_id, pipeline_id) where is_won = true and archived_at is null`.
- `crm_deal_stage_history (tenant_id, deal_id, occurred_at)`.
- `crm_deal_stage_history (tenant_id, to_stage_id, occurred_at)`.
- `crm_deals (tenant_id, pipeline_id, current_stage_id)`.
- `crm_deals (tenant_id, branch_id, current_stage_id)`.
- `crm_deals (tenant_id, archived_at)`.
- `crm_loss_reasons (tenant_id, archived_at)`.

## Compatibility Policy

CRM04 must be additive first:

- Existing app reads that depend on `crm_deals.stage = 'closed_won'` continue to work.
- New domain adapters read and write the normalized pipeline/stage fields.
- Deal create/update through the new adapter must write a legacy-compatible `stage`, `status`,
  `value_cents`, and `closed_at` mirror in the same database transaction as the normalized write
  while legacy readers still exist.
- If `currency_code !== 'EUR'`, the adapter must refuse to mirror `value_cents` and return a typed
  invalid-input result rather than silently writing a misleading legacy cent value.
- Legacy deal reads may be updated to prefer normalized fields only if the visible DTO/output stays
  unchanged and focused tests pin compatibility.
- Removal of legacy `crm_deals.stage`, `status`, or `value_cents` is out of scope.
- Legacy mirror writes stop only in `P38-CRM10 Legacy Deal Column Retirement`.

## Adapter Contract

The app-side SQL adapters must preserve the `domain-crm` ports/adapters split:

- `pipeline-repository.ts` maps `crm_pipelines` plus ordered `crm_pipeline_stages` to
  `CrmPipeline`.
- `deal-repository.ts` maps normalized `crm_deals` rows plus stage-history writes to
  `CrmDealRepository`.
- `loss-reason-repository.ts` or an equivalent focused adapter implements `LossReasonResolver`.
- Deal stage movement must update `crm_deals` and append `crm_deal_stage_history` in one database
  transaction using the default `READ COMMITTED` isolation unless the implementation explicitly
  justifies a stronger isolation level in the PR.
- Deal creation must insert `crm_deals` and the initial `crm_deal_stage_history` row in one
  database transaction.
- Idempotency keys remain reserved at the domain input/event layer; adapter-level
  `crm_idempotency_keys` enforcement is deferred unless an existing repository helper can be reused
  without widening scope.
- Outbox table persistence and workers remain out of scope; adapters return the typed domain event
  to callers as the existing domain mutations already do. CRM04 callers explicitly discard returned
  events after tests assert no outbox side channel writes them.

## Migration / Backfill Policy

The migration must be reversible enough for review and deterministic enough for CI:

- `ALTER TABLE crm_deals ADD COLUMN` operations must avoid defaults that rewrite the table.
- Backfill must run in batches with a bounded batch size documented in the PR and a statement
  timeout. Statement-level locks from metadata-only column additions are acceptable; long table
  rewrites are not.
- Seed a default pipeline per tenant or tenant-branch scope using the existing legacy stage set.
- Map `proposal` and `negotiation` to non-terminal stages, `closed_won` to the won stage, and
  `closed_lost` to the lost stage.
- Backfill branch custody from the joined `crm_leads.branch_id`; rows without usable branch custody
  must be recorded in a `crm_deal_backfill_quarantine` table with deal id, tenant id, reason code,
  and created timestamp.
- Backfill `value_amount_minor` from `value_cents` only when currency is verified. Rows without a
  verifiable currency must be quarantined with reason `unknown_currency`; CRM04 must not default
  unknown historical currency to `EUR`.
- Backfill `forecast_category = 'closed'` for terminal legacy deals and `pipeline` for open legacy
  deals.
- Backfill one initial stage-history row per legacy deal with `from_stage_id = null`,
  `to_stage_id = current_stage_id`, `kind = 'created'`, `pipeline_id = pipeline_id`, and a
  deterministic migration actor marker if no real actor is available.
- Seed starter loss reasons per tenant: `price`, `competitor`, `timing`, `no_decision`, and
  `other`, unless tenant-scoped reasons already exist.
- Rollback procedure: drop new FKs first, then dependent indexes, then `crm_deal_stage_history`,
  `crm_loss_reasons`, `crm_pipeline_stages`, `crm_pipelines`, quarantine tables, and finally new
  nullable `crm_deals` columns. Legacy deal columns remain untouched.
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
are allowed to depend on the new write path. At least one adapter test must simulate concurrent stage
moves on the same deal and prove the second move is rejected with typed `stage_drift` rather than
silently winning.

## Verification Plan

Focused implementation proof:

- Migration is generated through `pnpm db:generate`; manual `_journal.json` edits are prohibited.
- `pnpm db:push` succeeds against a freshly seeded local/test database before PR merge.
- `pnpm --filter @interdomestik/database type-check`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/domain-crm`
- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm db:migrations:check-journal`
- `pnpm check:db-access`
- Any intentional `scripts/ci/db-access-baseline.json` change must be included in the PR and tied to
  the new domain-CRM adapter queries. If no baseline update is needed, the PR must say why.
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
  use composite `(tenant_id, id)` unique keys and composite FKs on every new reference.
- **Pipeline defaults.** A synthesized default pipeline is acceptable for migration. Tenant-custom
  pipeline management UI is deferred.
- **Unknown historical currency.** CRM04 must quarantine rows without verifiable currency instead of
  defaulting them to `EUR`.
- **Stage archive interaction.** Stage archive is refused while any non-archived deal references the
  stage as its current stage.
- **Outbox persistence.** Typed events already exist, but durable outbox table/worker fanout is not
  part of CRM04.
- **Reporting timing.** CRM05 must wait until normalized persistence lands; it should not build
  funnel/velocity read-models over legacy `stage` text.
- **Legacy retirement.** Removing or renaming existing deal columns is deferred to
  `P38-CRM10 Legacy Deal Column Retirement` after all active readers/writers are migrated.

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
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | post-normalized-readers  | Future removal of legacy deal mirrors after readers/writers migrate.  |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | post-backfill-proof      | Future NOT NULL/FK tightening after zero-null production proof.       |
