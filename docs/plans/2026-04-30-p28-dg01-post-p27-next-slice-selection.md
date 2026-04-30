# P28-DG01 Post-P27 Next Slice Selection

## Metadata

- Date: 2026-04-30
- Slice: `P28-DG01`
- Status: Complete
- Owner: `platform + product + security + qa`
- Purpose: select the next bounded implementation slice after completed `P27` without widening into broad CRM, agent-workspace, analytics, routing, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                | Finding                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                     | `P27` is complete through `P27-DG01` and `P27-AGENT01`; further P27, agent-workspace, CRM, productization, analytics, observability, route, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work is unpromoted.                   |
| `docs/plans/2026-04-30-p27-dg01-post-p26-next-tranche-selection.md`                                     | The prior gate records that `P27-AGENT01` consumed the only promoted P27 implementation slice and promotes no further implementation slice.                                                                                                          |
| `docs/plans/current-tracker.md` `P15-S01`                                                               | Production runtime hardening is already canonical: debug/test-only endpoints are unavailable in production, billing test activation cannot run in production, and diagnostics require explicit local E2E enablement.                                 |
| `apps/web/src/lib/runtime-environment.ts` and `apps/web/src/actions/billing-test.ts`                    | The billing test activation server action is correctly guarded by `isBillingTestActivationEnabled()`, which requires explicit test flags and fails closed for production deployments except local E2E.                                               |
| `apps/web/src/app/[locale]/(app)/member/membership/success/_core.entry.tsx`                             | The membership success page renders `MockActivationTrigger` from `test=true`, `planId`, and `priceId` URL params alone. It does not check the same runtime guard before mounting the client trigger.                                                 |
| `apps/web/src/components/billing/mock-activation-trigger.tsx`                                           | The client trigger calls the guarded server action and logs an activation failure on rejection. In production this should remain unreachable from public URL params rather than relying on the server action to reject after client-side invocation. |
| `apps/web/src/app/[locale]/(app)/member/membership/success/page.test.tsx` and runtime-environment tests | Existing tests prove the success page state and runtime helper behavior independently, but no page-level test proves that the mock activation trigger is gated by the runtime helper before rendering.                                               |

## Selection Judgment

The strongest next implementation candidate is a small existing-route contract alignment, not CRM redesign, agent-workspace redesign, or product analytics. The repository already hardened billing test activation at the server-action/runtime layer in `P15-S01`, but the canonical membership success surface can still mount the client-only activation trigger when URL params request it.

The implementation should align the UI mount condition with the existing runtime guard, preserving the guarded server action as defense in depth. This is bounded to `/member/membership/success` and supporting tests, does not touch billing provider architecture, Stripe, schema, proxy, routes, auth layering, tenancy architecture, or broad membership redesign, and is directly testable.

## Candidate Ranking

| Rank | Candidate                                                | Decision                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Membership success billing test activation UI guard      | Promote as `P28-MEM01`. It is a concrete route/runtime contract mismatch on an existing member surface with an already-established production-hardening requirement and a narrow implementation path.                      |
| 2    | Narrow `/agent/leads/[id]` CRM follow-up                 | Do not promote now. `P26-CRM01` addressed the known lead-detail productization defects, and `P26-DG02` plus `P27-DG01` found no fresh bounded CRM detail defect.                                                           |
| 3    | Additional CRM productization                            | Do not promote now. Current evidence lacks a concrete CRM surface and defect stronger than the membership success runtime guard mismatch.                                                                                  |
| 4    | Agent-workspace redesign                                 | Do not promote. `P27` closed the narrow query-contract gap and did not produce a repo-custodied design artifact for broad workspace IA or visual redesign.                                                                 |
| 5    | Product analytics expansion                              | Do not promote. No repo-custodied measurement design artifact or immediate product question is specific enough for implementation.                                                                                         |
| 6    | Observability or monitoring console-noise cleanup        | Do not promote now. Prior gates treated the `403` observation as console noise rather than a proven user-facing blocker; the current candidate is a narrower route/runtime alignment with production-hardening evidence.   |
| 7    | Repo QA MCP tooling                                      | Do not promote as product work. PR `#605` improved execution tooling; the tooling should be used for execution but is not the implementation target.                                                                       |
| 8    | Broad SaaS redesign, broad CRM redesign, portal redesign | Do not promote. The slice would be too wide and would risk route, auth, tenant, accessibility, localization, and existing E2E contracts without a stronger repo-custodied design artifact and bounded acceptance criteria. |

## Decision

Promote exactly one bounded implementation slice:

`P28-MEM01 Membership Success Billing Test Activation Guard`

## P28-MEM01 Draft Design Plan

### Scope

- Existing canonical route: `/member/membership/success`.
- Existing server component: `MembershipSuccessPage`.
- Existing client trigger: `MockActivationTrigger`.
- Existing runtime guard: `isBillingTestActivationEnabled()`.
- Existing server action: `mockActivateSubscription`.

### Acceptance Criteria

- The success page renders `MockActivationTrigger` only when the existing runtime guard says billing test activation is enabled and the required test params are present.
- Public or production-like runtime with `?test=true&planId=...&priceId=...` does not mount the client trigger.
- Local E2E/test runtime behavior remains available when the existing billing test activation guard allows it.
- The guarded server action remains unchanged as defense in depth.
- Existing success-page active, pending, tenant-classification, redirect, and CTA behavior remains unchanged.
- Add focused tests proving the page-level render guard for disabled and enabled billing test activation.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename or bypass canonical routes.
- Do not refactor routing, auth, tenancy architecture, billing provider architecture, schema, Stripe posture, CRM IA, broad agent workspace, product analytics, README, AGENTS, or architecture docs.

### Suggested Branch

`codex/p28-mem01-membership-success-test-activation-guard`

### Verification Standard

- Focused tests for changed behavior.
- `git diff --check`
- `pnpm verify-slice -- --static`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- Remote PR checks, SonarCloud, Copilot, and PR finalizer green before merge.
