# P38-DG03 Pipeline And Deal Aggregate Design

## Status

- Date: 2026-05-13
- Classification: design gate and implementation promotion
- Current branch: `codex/p38-dg03-pipeline-deal-design`
- Promoted implementation slice: `P38-CRM03 Pipeline And Deal Domain Foundation`
- Authority: this gate opens `P38-CRM03` only; no scope outside the bounds in this document is authorized by signing it.

## Inputs

- `P38-DG01` ranked configurable pipelines and deals immediately after accounts, contacts, and lead conversion.
- `P38-CRM01` added the typed domain outbox contract for future CRM state-change publication. The current union is exported from `packages/domain-crm/src/outbox/types.ts` and already includes `crm.deal.won`.
- `P38-CRM02` completed first-class domain contracts for accounts, contacts, account-contact relationships, and lead conversion through PR `#745`, merge commit `1160d8dd1c6ca5d35329b099bd4dd22ebd432430`.
- `2026-05-13` CRM analysis identified deal pipeline as the second-highest P0 gap after accounts/contacts/conversion, and flagged the current bare deal stage shape as a blocker for weighted pipeline, stage velocity, loss analysis, and forecast credibility.
- The existing `crmDeals` schema in `packages/database/src/schema/crm.ts` is retained as a legacy persistence row; this slice does not modify it.

## Decision

Promote `P38-CRM03 Pipeline And Deal Domain Foundation` as the next bounded implementation slice.

### Rationale

Account, contact, and lead-conversion contracts now exist as first-class aggregates in `packages/domain-crm`. Until deal pipeline becomes a configured aggregate with stages, probabilities, terminal flags, and stage history, neither the agent nor the admin dashboards can answer weighted pipeline, stage velocity, win rate by source, or forecast trend — that is, the Dashboard Professionalism program cannot promote past counter widgets. This slice establishes only the domain contract so future persistence, adapter, and reporting read-model slices become small, low-risk follow-ups.

### Implementation constraints

The implementation must stay in `packages/domain-crm` and establish the domain contract before persistence or web wiring:

- Add domain modules for `pipelines` and `deals`.
- Define tenant-scoped configurable pipelines with ordered stages.
- Define stage metadata for probability, won/lost terminal flags, and expected duration.
- Define forecast categories as a controlled domain union: `pipeline`, `best`, `commit`, `omitted`, `closed`.
- Define tenant-scoped loss-reason contracts via a `LossReasonResolver` port; no persistence schema is added in this slice.
- Promote deal state into a domain aggregate with account/contact references, expected close date, forecast category, amount/currency, current stage, pipeline reference, and archived metadata.
- Model deal stage movement through append-only stage-history records at the repository-port layer.
- Model deal reopen explicitly as a typed input (`reopenReason`, target non-terminal stage) emitting `crm.deal.reopened`.
- Use injected clock and ID services for deterministic tests (mirror `CrmLeadFollowUpClock` / `CrmLeadFollowUpIds`).
- Use repository ports and in-memory adapters in unit proof; no SQL or `drizzle-orm` import may appear in domain code.
- Extend the outbox event union with the named additions in the Outbox Extensions section below.
- Preserve the existing `crm.deal.won` event shape (no breaking change).

## P38-CRM03 Scope

### In scope

- `packages/domain-crm/src/pipelines` — `types.ts`, `repository.ts`, `mutations.ts` (create pipeline, add stage, reorder stages, edit stage probability/expected-duration, archive pipeline), pure validators, `index.ts`.
- `packages/domain-crm/src/deals` — `types.ts`, `repository.ts`, `mutations.ts` (create, move stage, win, lose, reopen, archive), `loss-reason.ts` (resolver port + in-memory helper), `next-action.ts` (`deriveDealNextAction` read-model), `index.ts`.
- `packages/domain-crm/src/outbox` — narrow extension of the typed event union and helpers (see Outbox Extensions).
- `packages/domain-crm/src/index.ts` — re-exports for the new modules.
- `packages/domain-crm/package.json` — `exports` entries for `./pipelines*`, `./deals*` matching the existing per-module pattern.
- Focused in-memory unit tests for pipeline/stage validation, deal creation, stage movement, terminal-stage behavior, reopen semantics, forecast-category validation, currency/amount discipline, and loss-reason resolution.
- Type-level regression test pinning `CrmDomainEvent` backward compatibility from `P38-CRM01`.
- Program/tracker evidence updates.

### Out of scope unless separately authorized

- Database schema and migrations for `crm_pipelines`, `crm_pipeline_stages`, `crm_deal_stage_history`, or `crm_loss_reasons`.
- SQL adapters under `apps/web/src/lib/domain-crm`.
- Web routes, UI, dashboard widgets, reporting read-models, forecast snapshots, data backfill, or replacement of existing app-side `crmDeals.stage` reads.
- Accounts/contact persistence wiring beyond typed ID references from the domain contracts.
- Lead dedupe, routing, tasks, templates, sequences, activity channels, scoring, consent, external enrichment, quotes, search, retention, or workflow automation.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS, or broad architecture-doc edits.

## Outbox Extensions

The following typed event variants must be added to `CrmDomainEvent` in `packages/domain-crm/src/outbox/types.ts`. All other existing event variants — including `crm.deal.won` — remain unchanged.

- `crm.deal.created` — `{ dealId, pipelineId, pipelineStageId, accountId, contactId?, agentId, branchId, valueAmountMinor, currencyCode, forecastCategory, expectedCloseAt? }`
- `crm.deal.stage_changed` — `{ dealId, pipelineId, fromStageId, toStageId, isWon: false, isLost: false }`
- `crm.deal.lost` — `{ dealId, pipelineId, fromStageId, toStageId, lossReasonId }`
- `crm.deal.reopened` — `{ dealId, pipelineId, fromStageId, toStageId, reopenReason }`

Behavioral rule: a transition to an `isWon` stage emits the existing `crm.deal.won` event; a transition to an `isLost` stage emits `crm.deal.lost`; non-terminal transitions emit `crm.deal.stage_changed`. The events are mutually exclusive — never two for the same transition.

`CRM_DOMAIN_EVENT_TYPES` must be extended with the four new literals; `'deal'` already exists in `CRM_DOMAIN_EVENT_AGGREGATE_TYPES`.

## Authorization Model

All deal and pipeline mutations consume the existing `CrmActorContext` and return typed denial reasons drawn from the existing union (`tenant_scope`, `agent_scope`, `branch_scope`, `role_scope`). New denial reasons may be introduced only where the existing four cannot express the rule.

- **Pipeline CRUD:** `admin` or `branch_manager` only. `branch_manager` is restricted to pipelines whose authoring branch matches `actor.scope.branchId`.
- **Deal create, stage move, win, lose:** owning `agent` under the actor's branch, mirroring `authorizeExistingLead` in `leads/mutations.ts`. Staff-like actors (`staff`, `branch_manager`, `admin`) may act on any deal in their scope per `isStaffLikeCrmActor`.
- **Deal reopen:** `branch_manager` or `admin` only. Agents and staff cannot reopen.
- **Deal archive:** owning agent or staff-like.

Authorization is enforced in pure domain functions, not at the adapter layer.

## Validation Rules

The acceptance tests must pin the following:

- Pipeline stage ordinals are unique non-negative integers per pipeline. Gaps are permitted; duplicates are rejected (`invalid_stage_order`).
- Stage probability is an integer in `[0, 100]`. Non-terminal stages must have probability strictly less than `100`. `isWon` stages have probability `100`; `isLost` stages have probability `0`. A stage with both `isWon: true` and `isLost: true` is rejected (`invalid_terminal_flags`).
- Exactly one `isWon` stage and at least one `isLost` stage per pipeline; pipelines failing this are rejected on create or on stage-removal.
- Forecast category is the controlled union `'pipeline' | 'best' | 'commit' | 'omitted' | 'closed'`. Terminal-stage deals must carry `'closed'`; non-terminal deals must not carry `'closed'`.
- Currency is a 3-letter ISO 4217 code matching `^[A-Z]{3}$`; amount is a non-negative integer in minor units. Currency is immutable after deal creation.
- `expectedCloseAt`, when present, must be a valid ISO-8601 timestamp. It is not required to be in the future. Moving a deal into an `isWon`/`isLost` stage preserves the field for audit but excludes it from the `next-action` read-model.
- Loss-reason references are validated through a `LossReasonResolver` port: `resolveLossReason({ actor, lossReasonId }): Promise<{ id, code } | null>`. An in-memory `staticLossReasonResolver(reasons)` helper is exported from `packages/domain-crm/src/deals/loss-reason.ts` for tests and seed paths.
- Stage movement is rejected if `fromStageId !== deal.currentStageId` (`stage_drift`), guarding against concurrent edits.
- Reopen requires a non-empty `reopenReason` after trim and a target stage that is non-terminal in the same pipeline.
- Idempotency: every mutation accepts an optional `idempotencyKey: string` and surfaces it on the emitted outbox event; deduplication itself is the adapter's responsibility and out of scope here, but the domain contract must reserve the field now.

## Acceptance Criteria

- `packages/domain-crm` exports pipeline, pipeline-stage, deal, deal-stage-history, forecast-category, loss-reason resolver, and reopen contracts via `package.json` `exports` entries matching the existing per-module pattern.
- Pipeline-stage validation rejects: duplicate order, probability outside `[0, 100]`, ambiguous `isWon`+`isLost`, missing terminal stages.
- Deal creation validates: actor tenant/branch scope, pipeline existence in same tenant, stage belonging to that pipeline, account and (optional) contact reference IDs in same tenant, amount/currency shape, expected close date, forecast category compatibility with stage terminality.
- Stage movement validates: same-tenant pipeline/stage references, `fromStageId` matches `deal.currentStageId`, terminal-deal rejection (except via reopen), and appends a stage-history row through the repository port.
- Lost-stage movement requires a valid tenant-scoped loss reason resolved through `LossReasonResolver`; won-stage movement rejects any loss reason supplied.
- Reopen is authorized only for `branch_manager` or `admin`, requires a non-empty `reopenReason`, requires a non-terminal target stage in the same pipeline, and emits `crm.deal.reopened` rather than `crm.deal.stage_changed`.
- Domain event helpers describe deal creation, stage change, won, lost, and reopen transitions; the pre-existing `crm.deal.won` event remains exported with the same shape.
- `CrmDomainEvent` remains backward-compatible: every variant from `P38-CRM01` is still assignable. A type-level regression test pins this.
- Unit tests prove: valid creation, invalid pipeline/stage mismatch, invalid forecast category, loss-reason required-vs-absent matrix, terminal-stage rejection, stage-drift rejection, reopen authorization, append-only stage-history, currency immutability, and amount non-negativity.
- No SQL or `drizzle-orm` import appears anywhere under `packages/domain-crm/src/{pipelines,deals,outbox}/**`.
- `pnpm pr:verify` passes including the boundary-contract check.

## Verification Plan

### Focused proof

- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm exec prettier --check packages/domain-crm/package.json packages/domain-crm/src/index.ts 'packages/domain-crm/src/{pipelines,deals,outbox}/**/*.ts'`
- Boundary-contract check (the existing repo gate from `docs/plans/2026-03-03-boundary-contract-check.md`) must report no new violations.

### Required proof before PR

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

### Coverage discipline

Per existing `packages/domain-crm` convention, every `success | error` branch returned by a new mutation must have at least one dedicated test. The type-level regression for `CrmDomainEvent` backward compatibility lives in a `*.test-d.ts` companion file or an equivalent `expectTypeOf` block inside a `.test.ts`.

## Risks and Open Questions

- **Probability mutability on a live pipeline.** Editing stage probability after deals are open changes weighted-pipeline values retrospectively. Position: probability is mutable, change history is captured in `crm_pipeline_stage_history` (deferred to the persistence slice); reporting read-models in `P38-CRM05` will decide whether to use point-in-time probability or current.
- **Aggregate-ID alignment with legacy `crmDeals.id`.** Position: the domain aggregate ID is opaque to the domain layer; the persistence slice will decide whether to reuse `crmDeals.id` (forward-compatible) or introduce a new identity. The domain contract treats `dealId` as a string.
- **Multi-pipeline migration path.** Tenants today have no explicit pipeline. Position: persistence slice introduces a synthesized "default pipeline" per tenant with the seven historical stages; this gate does not commit to that detail.
- **`crm.deal.won` retained vs. unified.** Keeping the legacy variant alongside the new specialized events is intentional for backward compatibility with `P38-CRM01`. A future cleanup gate may unify if no external consumer depends on the old shape.
- **Reopen target stage selection.** Position: caller-specified non-terminal stage in the same pipeline. Auto-revert to the previous non-terminal stage is rejected as too clever for first slice.
- **Loss-reason resolver locality.** Without persistence, every adapter call site has to provide a resolver. Position: an in-memory `staticLossReasonResolver(reasons)` helper is exported from `packages/domain-crm/src/deals/loss-reason.ts` to keep callers honest until the SQL adapter lands.
- **Idempotency-key field reserved but unenforced.** Reserving `idempotencyKey` now avoids a breaking change later; not enforcing dedup in domain code preserves the ports/adapters split.

## Dependency / Sequencing

This slice unblocks:

- A future pipeline/deal persistence slice — SQL schema (`crm_pipelines`, `crm_pipeline_stages`, `crm_deal_stage_history`, `crm_loss_reasons`), Drizzle adapters under `apps/web/src/lib/domain-crm`, and any migration that adds pipeline/stage references to `crmDeals`.
- A future pipeline reporting read-model slice — funnel conversion, stage velocity, weighted pipeline, win rate by source — all blocked on this slice's contracts.
- Dashboard Professionalism Design Gate (next tranche after CRM) — agent and admin pipeline widgets cannot be specified above counter level until this contract exists.

This slice is **not** a dependency of: dedupe, routing, tasks, templates, sequences, scoring, consent, or external enrichment.

## Non-Goals

- No persistence schema in this slice.
- No web adapter or UI wiring in this slice.
- No dashboard reporting or forecast snapshots before persisted pipelines and deals exist.
- No broad CRM redesign or route behavior changes.
- No retirement of the legacy `crmDeals.stage` text reads in `apps/web`; that retirement is a `P38-CRM04` follow-up.
- No retroactive emission of `crm.deal.created` for pre-existing `crmDeals` rows; backfill is deferred to the persistence slice and explicitly out of scope here.

## Promotion Boundary

Merging this design gate authorizes `P38-CRM03` only. Persistence, adapters, reporting, dashboard work, and forecast snapshots require their own later design gates.
