# P19-DG03 CRM Mutation Slice Selection

## Metadata

- Date: 2026-04-26
- Slice: `P19-DG03`
- Status: Complete
- Purpose: select the next bounded `P19` implementation slice after `P19-CRM02`, using repo-backed CRM mutation evidence without widening into broad CRM or agent-workspace redesign.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize changes to `apps/web/src/proxy.ts`, canonical routes, auth layering, tenancy architecture, Stripe posture, schema, portal structure, product analytics instrumentation, broad CRM redesign, or broad agent-workspace redesign.

## Evidence Reviewed

| Evidence                                                                                            | Finding                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                 | `P19-DG01`, `P19-CRM01`, `P19-DG02`, and `P19-CRM02` are complete; `P19` remains active, but no next implementation slice is currently promoted.                                                                                                                                                                                      |
| `apps/web/src/lib/actions/agent.core.ts`                                                            | The legacy agent CRM server actions resolve agent session for `updateLeadStatus` and `logActivity`, but do not resolve tenant identity before calling the CRM mutation cores.                                                                                                                                                         |
| `apps/web/src/lib/actions/agent/update-lead-status.core.ts`                                         | The legacy CRM status mutation core accepts `agentId`, `leadId`, and `stage`, then reads and updates `crmLeads` by lead id without a tenant-scoped predicate.                                                                                                                                                                         |
| `apps/web/src/lib/actions/agent/log-activity.core.ts`                                               | The legacy CRM activity mutation core accepts `agentId`, `leadId`, `type`, and `summary`, then reads `crmLeads` by lead id and uses the fetched lead tenant for the inserted activity instead of requiring tenant identity from the action boundary.                                                                                  |
| `apps/web/src/lib/actions/agent.test.ts`                                                            | Existing wrapper tests cover authorized owner and not-owner behavior for the legacy mutations, but do not cover missing tenant identity or tenant propagation into the mutation cores.                                                                                                                                                |
| `apps/web/src/features/agent/leads/actions.ts`                                                      | The newer member-lead action path already resolves tenant identity with `ensureTenantId`, builds a scoped tenant/agent predicate, and updates through that predicate. This is a useful implementation reference, not the primary gap.                                                                                                 |
| `apps/web/src/actions/activities/log-lead.core.ts` and `packages/domain-activities/src/log-lead.ts` | The domain activity path already checks session role and missing tenant identity before writes, with tests for missing tenant and cross-tenant denial. It should not be mixed into the next slice.                                                                                                                                    |
| `packages/domain-leads/src/create.ts`, `payment.ts`, `verify.ts`, and `convert.ts`                  | Domain lead creation and conversion require tenant context, while some payment/verification updates still use id-only update predicates after tenant-scoped lookup. These are adjacent hardening candidates, but they are payment/verification workflow semantics and should not be bundled with the existing agent CRM mutation gap. |

## Ranking

| Rank | Candidate                                              | Decision                                                                                                                                                                               |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Legacy agent CRM mutation tenant-boundary contracts    | Promote. Existing `updateLeadStatus` and `logActivity` action wrappers and cores are small, tenant-bearing CRM write paths with clear missing-tenant and cross-tenant hardening value. |
| 2    | Domain lead payment and verification update predicates | Do not promote now. Adjacent tenant-safety improvement, but it belongs to payment/verification workflow hardening rather than the current CRM readiness line.                          |
| 3    | Newer member-lead action path refinement               | Do not promote. The path already resolves tenant identity and uses scoped predicates for active action access checks.                                                                  |
| 4    | Broad CRM or agent-workspace redesign                  | Not promoted. There is still no repo-custodied agent-demo feedback artifact that justifies broad redesign or portal restructuring.                                                     |

## Decision

Promote `P19-CRM03 Agent CRM Mutation Tenant-Boundary Contracts` as the next bounded implementation slice.

## P19-CRM03 Acceptance Criteria

- Existing legacy agent CRM mutation wrappers resolve tenant identity at the action boundary before status or activity writes.
- Missing tenant identity returns the existing action error contract before CRM mutation cores or DB writes run.
- `updateLeadStatusCore` and `logActivityCore` require tenant identity and scope tenant-bearing `crmLeads` reads and writes by tenant plus agent ownership.
- Activity inserts use the boundary-resolved tenant identity, not tenant identity inferred from an unscoped lead lookup.
- Authorized happy paths preserve current return shapes, revalidation behavior, and user-visible CRM behavior.
- Add focused negative tests for missing tenant identity, cross-tenant or not-owned lead denial, tenant propagation into the mutation cores, and authorized happy paths.
- Inspect adjacent domain lead payment or verification predicates only if necessary to avoid conflicts; do not broaden into payment correctness.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, product analytics, broad CRM redesign, or broad agent-workspace redesign.

## Suggested Branch

`codex/p19-crm03-agent-crm-mutation-tenant-contracts`

## Verification Standard

- Focused action/core tests first.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix must-fix findings.
- `pnpm verify-slice -- --required-gates`.
