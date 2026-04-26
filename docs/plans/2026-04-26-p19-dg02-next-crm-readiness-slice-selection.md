# P19-DG02 Next CRM Readiness Slice Selection

## Metadata

- Date: 2026-04-26
- Slice: `P19-DG02`
- Status: Complete
- Purpose: select the next bounded `P19` implementation slice after `P19-CRM01`, using repo-backed CRM-readiness evidence without widening into broad CRM or agent-workspace redesign.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize changes to `apps/web/src/proxy.ts`, canonical routes, auth layering, tenancy architecture, Stripe posture, schema, portal structure, product analytics instrumentation, broad CRM redesign, or broad agent-workspace redesign.

## Evidence Reviewed

| Evidence                                                                                                          | Finding                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                               | `P19-DG01` and `P19-CRM01` are complete; `P19` remains active, but no next implementation slice is currently promoted.                                                                                                   |
| `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` and `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts` | `P19-CRM01` closed the dedicated `/agent/crm` route-boundary and read-core tenant contract for CRM stats.                                                                                                                |
| `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.ts`                                                     | `P19-CRM01` closed CRM lead-detail read scoping by tenant and viewer agent.                                                                                                                                              |
| `apps/web/src/features/agent/dashboard/components/AgentDashboardV2Page.tsx`                                       | The canonical agent dashboard still fetches V2 CRM statistics through `getAgentDashboardV2StatsCore({ agentId }, { db })` without passing tenant identity into the stats core.                                           |
| `apps/web/src/app/[locale]/(agent)/agent/_core.ts`                                                                | The V2 dashboard stats core reads `crmLeads`, `crmDeals`, `agentCommissions`, and `subscriptions` by agent/referrer/status only; those tables carry tenant identity and should be explicitly tenant-scoped in this path. |
| `apps/web/src/app/[locale]/(agent)/agent/leads/_core.ts` and `workspace/leads/_core.ts`                           | Existing lead-list surfaces already resolve tenant identity at the page boundary and query by tenant. Agent-only refinement may be product semantics, but it is less urgent than tenant-bearing CRM KPI reads.           |
| `apps/web/src/lib/actions/agent/update-lead-status.core.ts` and `log-activity.core.ts`                            | Legacy CRM mutation helpers still have tenant-scope improvement opportunities, but these are write-contract changes and should follow the dashboard read-contract hardening rather than be mixed into it.                |

## Ranking

| Rank | Candidate                                     | Decision                                                                                                                                                                                               |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Agent dashboard CRM KPI tenant read contracts | Promote. The existing canonical `/agent` dashboard reads tenant-bearing CRM tables without tenant identity in the stats core, making this the smallest next read-contract hardening slice after CRM01. |
| 2    | CRM mutation tenant-boundary contracts        | Do not promote yet. Important, but it touches write-path behavior and should be its own later slice after the dashboard read path is normalized.                                                       |
| 3    | Lead-list agent-only refinement               | Do not promote yet. Lead lists already resolve tenant identity and query by tenant; whether they should additionally filter by agent is product/workflow semantics rather than the next boundary gap.  |
| 4    | Broad CRM or agent-workspace redesign         | Not promoted. There is still no repo-custodied agent-demo feedback artifact that justifies broad redesign or portal restructuring.                                                                     |

## Decision

Promote `P19-CRM02 Agent Dashboard CRM KPI Tenant Read Contracts` as the next bounded implementation slice.

## P19-CRM02 Acceptance Criteria

- Existing canonical `/agent` dashboard code resolves tenant identity at the route/component boundary before CRM KPI reads.
- `getAgentDashboardV2StatsCore` requires `tenantId` and scopes tenant-bearing CRM KPI reads by tenant plus agent/referrer semantics.
- Tenant-bearing reads in scope include `crmLeads`, `crmDeals`, `agentCommissions`, and referred client count queries where the backing table has `tenantId`.
- Missing tenant identity is rejected through the existing route/component error behavior rather than falling through to generic dashboard data reads.
- Authorized happy paths preserve the existing dashboard DTO shape and visual behavior.
- Add focused unit tests for missing tenant identity at the dashboard boundary and tenant-scoped V2 dashboard KPI queries.
- Inspect the legacy lite dashboard core only to decide whether it is reachable from current surfaces; do not broaden into unrelated dashboard redesign.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, product analytics, broad CRM redesign, or broad agent-workspace redesign.

## Suggested Branch

`codex/p19-crm02-agent-dashboard-crm-kpi-tenant-contracts`

## Verification Standard

- Focused dashboard route/component/core tests first.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix must-fix findings.
- `pnpm verify-slice -- --required-gates`.
