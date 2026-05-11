---
status: design-review
date: 2026-05-11
slice: P36-DG02
title: Post-DM01 Closeout And Next CRM Data-Model Slice
owner: platform + product + qa
phase: Phase C
---

# P36-DG02 Post-DM01 Closeout And Next CRM Data-Model Slice

## Decision

`P36-CRM-DM01 Durable CRM Lead Branch Ownership` is closed after PR `#722`, merge commit
`14bad1bf236e30621abe88659182d3291242f718`.

P36 remains the active CRM Data-Model Hardening tranche. The live program and tracker must no
longer describe DM01 as PR-pending.

The next bounded implementation slice is:

`P36-CRM-DM02 CRM Lead Lifecycle History And Stage Discipline`

This gate promotes DM02 because DM01 fixed durable branch custody, but the CRM lead lifecycle still
has no transition history, terminal timestamps, or database-level stage discipline. That is the
next material data-model weakness before task aggregates, dashboard analytics, automation,
campaigns, AI, or broad CRM redesign.

## Inputs

| Input                          | Relevance                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#722` / `P36-CRM-DM01`     | Merged durable CRM lead branch ownership onto `main` and removed current-agent-branch reconstruction from active CRM lead mutation adapters.         |
| Local real-DB branch smoke     | Proved a lead keeps its original branch after the assigned agent moves branches, the original branch can still mutate it, and the new branch cannot. |
| CRM data-model re-review       | Identifies missing lifecycle history, free-text stage storage, and missing terminal timestamps as the next production CRM data-model gap.            |
| Existing `domain-crm` boundary | `updateCrmLeadStage` is already behind explicit actor, tenant, agent, and branch authorization, so history can be written after successful auth.     |

## Promoted Slice

`P36-CRM-DM02 CRM Lead Lifecycle History And Stage Discipline`

Implementation scope:

- Add `crm_lead_stage_history`.
- Make authorized `updateStage` writes append exactly one transition-history row per successful
  stage transition.
- Add focused domain/app tests proving one history row per successful transition and no history row
  on failed authorization.
- Add database stage discipline for `crm_leads.stage` through a check or enum-compatible
  constraint.
- Add `won_at` and `lost_at` only if they remain tightly coupled to terminal `won` and `lost`
  transitions.

Allowed touch points:

- `packages/database/src/schema/crm.ts`
- CRM Drizzle migration files
- `packages/domain-crm/src/leads/**`
- `apps/web/src/lib/domain-crm/lead-mutation-repository.ts`
- Focused tests for the touched domain and app adapter paths
- `docs/plans/**` for proof and closeout state

Must not touch:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- Stripe
- README, AGENTS, or broad architecture docs
- pipeline UI, task aggregate work, automation, AI, campaigns, cron/NPS architecture,
  `member_leads` unification, dashboard analytics, or broad DB posture burn-down

## Acceptance Criteria For DM02

- Successful stage transitions append exactly one `crm_lead_stage_history` row with tenant, lead,
  actor, previous stage, new stage, and occurrence time.
- Failed authorization does not update the lead and does not append a history row.
- Same-stage submissions are either explicit no-ops with no history row or are rejected; the chosen
  behavior is documented in tests.
- Terminal `won` and `lost` transitions set only the matching terminal timestamp when timestamps
  are included.
- Non-terminal transitions clear terminal timestamps when timestamps are included.
- `crm_leads.stage` cannot persist values outside the supported CRM lead stage set.
- Existing DM01 branch-ownership proof remains valid.

## Verification Plan

- Focused `domain-crm` lead mutation tests.
- Focused web adapter tests for CRM lead mutation repository history writes.
- Database type-check and migration journal check.
- `pnpm check:db-access`.
- `pnpm plan:status`.
- `pnpm plan:audit`.
- `pnpm track:audit`.
- `pnpm docs:verify`.
- `git diff --check`.
- `pnpm verify-slice -- --static`.
- `pnpm verify-slice -- --required-gates`.
- `interdomestik_qa.scope_audit` with the authorized paths.
- Diff-scoped Codex Security plugin scan.

## Non-Goals

- No product UI expansion.
- No task aggregate.
- No dashboard analytics implementation.
- No automation, campaign, cron/NPS, or AI work.
- No `member_leads` unification.
- No broad CRM redesign.
- No broad DB baseline burn-down.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or architecture-doc changes.
