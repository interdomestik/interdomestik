---
status: design-review
date: 2026-05-12
slice: P36-DG07
title: Post-DM06 Closeout And Next CRM Slice Selection
owner: platform + product + qa
phase: Phase C
---

# P36-DG07 Post-DM06 Closeout And Next CRM Slice Selection

## Decision

`P36-CRM-DM06 CRM Lead Detail Read-Side Domain Port` is closed after PR `#735`, merge
commit `cfcc14c74ed66a26658340494a50cf3ce9b0a78a`.

P36 remains the active CRM Data-Model Hardening tranche. The live program and tracker must no
longer describe DM06 as only in progress.

The next bounded implementation slice is:

`P36-CRM-DM07 CRM Lead Activity Timeline Read-Side Domain Port`

This gate promotes DM07 because DM06 removed the existing agent lead-detail lead/deal read path from
route-local database access, while the same `/agent/leads/[id]` surface still loads the activity
feed through `@/actions/activities` and the legacy `domain-activities` lead-activity read wrapper.
DM04 already made CRM activity branch snapshots and timeline query readiness durable, so the next
smallest useful correctness slice is to move the existing lead-detail activity-feed read into
`domain-crm` with the same tenant, agent, and branch custody used by the lead-detail read.

## Inputs

| Input                             | Relevance                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#735` / `P36-CRM-DM06`        | Merged the existing lead-detail lead/deal read behind `domain-crm/lead-details` with tenant, agent, and branch scope carried through `CrmActorContext`. |
| Remote merge evidence             | DM06 is on `main` through merge commit `cfcc14c74ed66a26658340494a50cf3ce9b0a78a`; PR checks, Copilot threads, and Sonar issues were resolved.          |
| Current activity-feed posture     | `AgentLeadDetailV2Page` still imports `getLeadActivities` from `@/actions/activities` and maps the feed locally before rendering `ActivityFeed`.        |
| Existing `domain-crm` boundary    | `CrmActorContext`, durable lead branch ownership, and CRM activity branch snapshots are already available for branch-aware read authorization.          |
| `pnpm check:db-access` after DM06 | The route-local lead-detail reads are gone; remaining CRM direct DB entries are domain adapters or the legacy lead-activity read/write surfaces.        |

## Promoted Slice

`P36-CRM-DM07 CRM Lead Activity Timeline Read-Side Domain Port`

Implementation scope:

- Move the existing agent lead-detail activity-feed read out of `@/actions/activities` /
  `domain-activities` for this CRM lead-detail surface.
- Add a narrow `domain-crm` read-side API for the existing lead activity feed, likely
  `getAgentCrmLeadActivities({ actor, leadId })`.
- Preserve the existing `ActivityFeed` UI/output behavior and the lead-detail follow-up next-action
  behavior that is derived from activities.
- Enforce tenant, agent, and branch scope through `CrmActorContext`, using durable lead branch
  custody and CRM activity branch snapshots.
- Add focused negative authorization/read tests proving cross-tenant, wrong-agent, and wrong-branch
  activity reads are rejected or excluded.
- Reduce or correctly classify remaining CRM lead-activity read direct-DB guard entries.

Allowed touch points for DM07:

- `packages/domain-crm/src/**` for a narrow lead-activity read-side API and tests.
- `apps/web/src/features/agent/leads/components/AgentLeadDetailV2Page.tsx` and focused tests.
- Thin app-side domain CRM adapter files under `apps/web/src/lib/domain-crm/**`.
- Focused tests for the touched domain and app adapter/page paths.
- DB-access guard metadata only for correctly classifying or reducing the lead-activity read entry.
- `docs/plans/**` for proof and closeout state.

Must not touch in DM07:

- `apps/web/src/proxy.ts`.
- Canonical routes `/member`, `/agent`, `/staff`, or `/admin`.
- Auth provider layering or session shape.
- Tenancy architecture.
- Stripe.
- README, AGENTS, or broad architecture docs.
- Task aggregate work, automation, AI, campaigns, cron/NPS architecture, `member_leads`
  unification, timeline UI rewrites, dashboard analytics expansion, or broad CRM redesign.

## Acceptance Criteria For DM07

- The agent lead-detail page delegates the activity-feed read through `domain-crm`.
- The domain read-side API requires an actor with tenant, agent, and branch scope before returning
  activity-feed data.
- Cross-tenant activity rows are excluded or rejected.
- Wrong-agent activity rows are excluded or rejected.
- Wrong-branch activity rows are excluded or rejected.
- Existing activity feed rendering and follow-up next-action behavior remain unchanged.
- Remaining direct-DB guard entries for the lead activity read path are either removed or classified
  with a narrow domain-adapter/read-model rationale.

## Verification Plan

- Focused `domain-crm` lead-activity read-side tests.
- Focused web adapter and lead-detail page tests proving unchanged DTO/output behavior and negative
  authorization behavior.
- `pnpm check:db-access`.
- `pnpm security:guard`.
- Relevant static/type checks for `domain-crm` and web.
- `pnpm verify-slice -- --static`.
- Required slice gate before merge if feasible.
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Non-Goals

- No product UI redesign or timeline UI rewrite.
- No task aggregate.
- No automation, campaign, cron/NPS, or AI work.
- No `member_leads` unification.
- No broad CRM redesign.
- No broad DB baseline burn-down.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or architecture-doc changes.
