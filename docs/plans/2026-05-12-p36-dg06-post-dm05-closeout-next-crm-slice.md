---
status: design-review
date: 2026-05-12
slice: P36-DG06
title: Post-DM05 Closeout And Next CRM Slice Selection
owner: platform + product + qa
phase: Phase C
---

# P36-DG06 Post-DM05 Closeout And Next CRM Slice Selection

## Decision

`P36-CRM-DM05 CRM Dashboard Read-Side Domain Port` is closed after PR `#733`, merge
commit `c771307684850368909ef21d5a6cfa0a565b09ad`.

P36 remains the active CRM Data-Model Hardening tranche. The live program and tracker must no
longer describe DM05 as only in progress.

The next bounded implementation slice is:

`P36-CRM-DM06 CRM Lead Detail Read-Side Domain Port`

This gate promotes DM06 because DM05 removed the agent CRM dashboard's route-local direct database
reads, while the existing `/agent/leads/[id]` lead-detail read path still performs route-local
lead/deal reads and only scopes them by tenant plus agent. After DM01 through DM04 made durable lead
branch custody and activity query readiness explicit, the lead-detail read path is now the smallest
useful correctness slice before task aggregates, dashboard analytics expansion, automation,
campaigns, AI, `member_leads` unification, timeline UI rewrites, or broad CRM redesign.

## Inputs

| Input                             | Relevance                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#733` / `P36-CRM-DM05`        | Merged the existing agent CRM dashboard reads behind `domain-crm/dashboards` with tenant, agent, and branch scope carried through `CrmActorContext`.  |
| Remote merge evidence             | DM05 is on `main` through merge commit `c771307684850368909ef21d5a6cfa0a565b09ad`; PR checks, Copilot threads, and Sonar issues were resolved.        |
| Current lead-detail posture       | `/agent/leads/[id]/_core.ts` still performs route-local lead and deal database reads for the existing lead-detail page.                               |
| Existing `domain-crm` boundary    | `CrmActorContext` already carries tenant, role, agent, and branch scope for CRM authorization and is the correct boundary for lead-detail reads.      |
| Durable P36 lead branch ownership | DM01 through DM04 made lead `branch_id`, ownership history, activity branch snapshots, and activity query-readiness available for branch-aware reads. |

## Promoted Slice

`P36-CRM-DM06 CRM Lead Detail Read-Side Domain Port`

Implementation scope:

- Move the existing agent CRM lead-detail lead/deal reads out of route-local direct database access.
- Add a `domain-crm` read-side API for the existing lead-detail read, likely
  `getAgentCrmLeadDetail({ actor, leadId })`.
- Preserve the existing lead-detail UI/output behavior for contact details, deal list, follow-up
  next action, and activity feed rendering.
- Enforce tenant, agent, and branch scope through `CrmActorContext`, using durable lead branch
  custody from the CRM lead row.
- Add focused negative authorization/read tests proving cross-tenant, wrong-agent, and wrong-branch
  lead-detail reads are rejected or excluded before deal data is returned.
- Reduce or correctly classify remaining CRM lead-detail direct-DB guard entries.

Allowed touch points for DM06:

- `packages/domain-crm/src/**` for a narrow lead-detail read-side API and tests
- `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/**`
- Thin app-side domain CRM adapter files under `apps/web/src/lib/domain-crm/**`
- Focused tests for the touched domain and app adapter/page paths
- DB-access guard metadata only for correctly classifying or reducing the lead-detail read entries
- `docs/plans/**` for proof and closeout state

Must not touch in DM06:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- Stripe
- README, AGENTS, or broad architecture docs
- task aggregate work, automation, AI, campaigns, cron/NPS architecture, `member_leads`
  unification, timeline UI rewrites, dashboard analytics expansion, or broad CRM redesign

## Acceptance Criteria For DM06

- Agent lead-detail route/core code delegates lead/deal detail reads through `domain-crm`.
- The domain read-side API requires an actor with tenant, agent, and branch scope before returning
  lead-detail data.
- Cross-tenant rows are excluded or rejected.
- Wrong-agent rows are excluded or rejected.
- Wrong-branch rows are excluded or rejected.
- Existing lead-detail UI/output behavior remains unchanged.
- Remaining direct-DB guard entries for the lead-detail read path are either removed or classified
  with a narrow domain-adapter/read-model rationale.

## Verification Plan

- Focused `domain-crm` lead-detail read-side tests.
- Focused web adapter/lead-detail tests proving unchanged DTO/output behavior and negative
  authorization behavior.
- `pnpm check:db-access`.
- `pnpm security:guard`.
- Relevant static/type checks for `domain-crm` and web.
- `pnpm verify-slice -- --static`.
- Required slice gate before merge if feasible.
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Non-Goals

- No product UI redesign, timeline UI rewrite, or dashboard analytics expansion.
- No task aggregate.
- No automation, campaign, cron/NPS, or AI work.
- No `member_leads` unification.
- No broad CRM redesign.
- No broad DB baseline burn-down.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or architecture-doc changes.
