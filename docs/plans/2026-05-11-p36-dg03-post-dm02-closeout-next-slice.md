---
status: design-review
date: 2026-05-11
slice: P36-DG03
title: Post-DM02 Closeout And Next CRM Data-Model Slice
owner: platform + product + qa
phase: Phase C
---

# P36-DG03 Post-DM02 Closeout And Next CRM Data-Model Slice

## Decision

`P36-CRM-DM02 CRM Lead Lifecycle History And Stage Discipline` is closed after PR `#724`,
merge commit `f374f858ca154707e51f11d560d459a338379fa4`.

P36 remains the active CRM Data-Model Hardening tranche. The live program and tracker must no
longer describe DM02 as only branch-implemented or PR-pending.

The next bounded implementation slice is:

`P36-CRM-DM03 CRM Lead Ownership History And Transfer Discipline`

This gate promotes DM03 because DM01 made current branch custody durable and DM02 made lifecycle
stage transitions auditable, but CRM lead ownership itself still lacks a first-class historical
record and a single domain operation for transfers. That gap is now the strongest remaining
data-model correctness issue before task aggregates, dashboard analytics, automation, campaigns,
AI, `member_leads` unification, or broad CRM redesign.

## Inputs

| Input                          | Relevance                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#724` / `P36-CRM-DM02`     | Merged CRM lead stage history, database stage discipline, terminal timestamp constraints, and same-transaction transition history writes onto `main`.             |
| Copilot closeout on PR `#724`  | The reviewed delete-behavior concern was fixed by making `crm_lead_stage_history.lead_id` cascade when a CRM lead is deleted, then all PR comments were resolved. |
| Remote check evidence          | PR `#724` merged only after SonarCloud, audit, commitlint, E2E, E2E gate, gitleaks, pilot gates, pnpm audit, PR finalizer, static, unit, and validation passed.   |
| Current CRM data-model posture | Branch ownership is durable and stage history is durable, but ownership history and transfer custody are still implicit in the mutable `crm_leads` row.           |

## Promoted Slice

`P36-CRM-DM03 CRM Lead Ownership History And Transfer Discipline`

Implementation scope:

- Add `crm_lead_ownership_history`.
- Make CRM lead creation append an initial ownership-history row with tenant, lead, agent, branch,
  actor, reason/source, and effective start time.
- Add one domain operation for CRM lead ownership transfer. This operation is the only supported
  path for changing lead agent or branch ownership after creation.
- Make successful transfers close the prior open ownership row and append a new ownership row in
  the same transaction as the lead row ownership update.
- Add migration/backfill support for existing CRM leads using the durable `crm_leads.agent_id` and
  `crm_leads.branch_id` values created by DM01.
- Add focused tests proving initial ownership history, transfer history, failed-authorization
  no-op behavior, cross-tenant denial, and branch-scope denial.

Allowed touch points for DM03:

- `packages/database/src/schema/crm.ts`
- CRM Drizzle migration files
- `packages/domain-crm/src/leads/**`
- `apps/web/src/lib/domain-crm/lead-mutation-repository.ts`
- Focused tests for the touched domain and app adapter paths
- `docs/plans/**` for proof and closeout state

Must not touch in DM03:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- Stripe
- README, AGENTS, or broad architecture docs
- pipeline UI, task aggregate work, automation, AI, campaigns, cron/NPS architecture,
  `member_leads` unification, dashboard analytics, or broad DB posture burn-down

## Acceptance Criteria For DM03

- Every new CRM lead has one initial ownership-history row tied to the same tenant, lead, agent,
  and durable branch as the lead row.
- A successful transfer closes exactly one prior open ownership-history row and opens exactly one
  new row.
- A failed authorization attempt does not update `crm_leads.agent_id`, `crm_leads.branch_id`,
  `crm_lead_ownership_history.effective_to`, or append a new ownership row.
- Cross-tenant and out-of-branch transfer attempts fail closed.
- Existing CRM lead mutations continue using durable row-owned branch custody from DM01.
- Existing CRM lead stage history behavior from DM02 remains unchanged.

## Verification Plan

- Focused `domain-crm` lead ownership and mutation tests.
- Focused web adapter tests for ownership-history creation and transfer transactions.
- Database type-check and migration journal check.
- `pnpm check:db-access`.
- `pnpm plan:status`.
- `pnpm plan:audit`.
- `pnpm track:audit`.
- `pnpm docs:verify`.
- `git diff --check`.
- `pnpm verify-slice -- --static`.
- `interdomestik_qa.scope_audit` with the authorized paths.
- Required gates before merge of the DM03 implementation PR.

## Non-Goals

- No product UI expansion.
- No task aggregate.
- No dashboard analytics implementation.
- No automation, campaign, cron/NPS, or AI work.
- No `member_leads` unification.
- No broad CRM redesign.
- No broad DB baseline burn-down.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or architecture-doc changes.
