---
status: design-review
date: 2026-05-12
slice: P36-DG05
title: Post-DM04 Closeout And Next CRM Slice Selection
owner: platform + product + qa
phase: Phase C
---

# P36-DG05 Post-DM04 Closeout And Next CRM Slice Selection

## Decision

`P36-CRM-DM04 CRM Activity Discipline And Dashboard Query Readiness` is closed after PR
`#727`, merge commit `47c76e08`.

P36 remains the active CRM Data-Model Hardening tranche. The live program and tracker must no
longer describe DM04 as only in progress.

The next bounded implementation slice is:

`P36-CRM-DM05 CRM Dashboard Read-Side Domain Port`

This gate promotes DM05 because DM04 made CRM activity rows query-ready for dashboard and timeline
reads, but the existing agent CRM dashboard still performs route-local direct database reads. Moving
that read path behind `domain-crm` is now the smallest useful correctness slice before task
aggregates, dashboard analytics expansion, automation, campaigns, AI, `member_leads` unification,
or broad CRM redesign.

## Inputs

| Input                          | Relevance                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#727` / `P36-CRM-DM04`     | Merged CRM activity dashboard/timeline indexes, activity-type discipline, branch snapshots, and the bounded future-write tenant/lead invariant onto `main`. |
| Remote merge evidence          | DM04 is on `main` through merge commit `47c76e08`; dependency PRs `#729`, `#730`, and security override PR `#731` are also merged ahead of this gate.       |
| Current CRM dashboard posture  | The agent CRM dashboard remains the next route-local direct-DB read surface after the DM04 query-readiness work.                                            |
| Existing `domain-crm` boundary | `CrmActorContext` already carries tenant, role, agent, and branch scope for CRM authorization and is the correct boundary for dashboard reads.              |

## Promoted Slice

`P36-CRM-DM05 CRM Dashboard Read-Side Domain Port`

Implementation scope:

- Move agent CRM dashboard reads out of route-local direct database access.
- Add a `domain-crm/dashboards` read-side API, likely
  `getAgentCrmDashboard({ actor })`.
- Preserve the existing dashboard DTO and visible UI/output behavior.
- Enforce tenant, agent, and branch scope through `CrmActorContext`.
- Add focused negative authorization/read tests proving cross-tenant, wrong-agent, and
  wrong-branch reads are rejected or excluded.
- Reduce or correctly classify remaining CRM dashboard direct-DB guard entries.

Allowed touch points for DM05:

- `packages/domain-crm/src/dashboards/**`
- `packages/domain-crm/src/index.ts`
- Existing agent CRM dashboard route/core files and thin app adapters needed to delegate to
  `domain-crm`
- Focused tests for the touched domain and app adapter paths
- DB-access guard metadata only for correctly classifying or reducing the dashboard read entries
- `docs/plans/**` for proof and closeout state

Must not touch in DM05:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- Stripe
- README, AGENTS, or broad architecture docs
- task aggregate work, automation, AI, campaigns, cron/NPS architecture, `member_leads`
  unification, dashboard analytics expansion, or broad CRM redesign

## Acceptance Criteria For DM05

- Agent CRM dashboard route/core code delegates dashboard reads through `domain-crm`.
- The domain read-side API requires an actor with tenant, agent, and branch scope before returning
  dashboard data.
- Cross-tenant rows are excluded or rejected.
- Wrong-agent rows are excluded or rejected.
- Wrong-branch rows are excluded or rejected.
- Existing dashboard UI/output behavior remains unchanged.
- Remaining direct-DB guard entries for the CRM dashboard are either removed or classified with a
  narrow domain-adapter/read-model rationale.

## Verification Plan

- Focused `domain-crm` dashboard read-side tests.
- Focused web adapter/dashboard tests proving unchanged DTO/output behavior and negative
  authorization behavior.
- `pnpm check:db-access`.
- `pnpm security:guard`.
- Relevant static/type checks for `domain-crm` and web.
- `pnpm verify-slice -- --static`.
- Required slice gate before merge if feasible.
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Non-Goals

- No product UI redesign or dashboard analytics expansion.
- No task aggregate.
- No automation, campaign, cron/NPS, or AI work.
- No `member_leads` unification.
- No broad CRM redesign.
- No broad DB baseline burn-down.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or architecture-doc changes.
