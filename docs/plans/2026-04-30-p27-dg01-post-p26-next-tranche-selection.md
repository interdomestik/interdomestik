# P27-DG01 Post-P26 Next Tranche Selection

## Metadata

- Date: 2026-04-30
- Slice: `P27-DG01`
- Status: Complete
- Owner: `platform + product + design + qa`
- Purpose: select the next bounded implementation slice after completed `P26` without widening into broad CRM, agent-workspace, analytics, routing, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                        | Finding                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                             | `P26` is complete through `P26-DG02`. Further P26, CRM, and productization work is unpromoted until a future repo-canonical gate identifies a concrete slice.                                                                                                                                     |
| `docs/plans/2026-04-30-p26-dg02-post-crm01-next-slice-selection.md`                                             | The prior closeout records that `P26-CRM01` consumed the only P26 implementation slice and does not promote broad CRM, agent-workspace redesign, analytics, observability, or another CRM productization slice.                                                                                   |
| `docs/plans/2026-04-29-p23-dg05-post-perf05-responsiveness-slice-selection.md`                                  | Agent workspace claim drawer selection was left unpromoted during P23 because the evidence was local filtering plus drawer URL selection rather than a server search/filter transition gap. That makes it too narrow for broad responsiveness work, but useful evidence for a query-contract fix. |
| `apps/web/src/app/[locale]/(agent)/agent/workspace/claims/page.tsx`                                             | The canonical agent workspace claims route accepts both `selected` and `claimId` query parameters and passes the resolved selection to the client surface.                                                                                                                                        |
| `apps/web/src/features/agent/claims/components/claim-selection.ts`                                              | Client-side selection resolution intentionally supports both `selected` and `claimId`, preserving direct claim-link behavior and the older query alias.                                                                                                                                           |
| `apps/web/src/features/agent/claims/components/AgentClaimsProPage.tsx`                                          | The drawer close handler only removes `selected` and returns early when `selected` is absent. A direct `/agent/workspace/claims?claimId=...` selection can therefore remain URL-stuck instead of clearing the active selection through the same close contract.                                   |
| `apps/web/e2e/gate/agent-workspace-claims-selection.spec.ts` and `apps/web/e2e/golden/agent-pro-claims.spec.ts` | Existing E2E proof covers opening by `claimId`, access denial for inaccessible `claimId`, message persistence after reload, and closing a drawer selected through row click. It does not cover close behavior for the direct `claimId` query selection path.                                      |
| Current repo search for `P27`                                                                                   | No repo-canonical `P27` tranche or implementation slice is currently recorded before this gate.                                                                                                                                                                                                   |

## Selection Judgment

The strongest next implementation candidate is not broad CRM redesign, broad agent-workspace redesign, analytics, or another lead-detail productization pass. The current evidence points to a small existing-surface contract gap on the canonical `/agent/workspace/claims` route: direct claim selection is explicitly supported by `claimId`, but the close path only clears `selected`.

This is bounded, user-visible, and testable without touching proxy, routing architecture, auth, tenant boundaries, schema, Stripe, CRM IA, or broad workspace design. It also reuses evidence from the completed P23 responsiveness gates without reopening P23 as a broad UI tranche.

## Candidate Ranking

| Rank | Candidate                                                   | Decision                                                                                                                                                                                             |
| ---- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Agent workspace claim selection close contract              | Promote as `P27-AGENT01`. It is a concrete route/query UX contract gap on an active canonical surface with existing E2E coverage for the adjacent open/access behavior.                              |
| 2    | Narrow `/agent/leads/[id]` follow-up                        | Do not promote now. `P26-CRM01` addressed the known hardcoded copy, locale, stage-label, and unbacked-action defects; no fresh lead-detail defect is recorded.                                       |
| 3    | Additional CRM productization                               | Do not promote now. Current evidence lacks a concrete CRM surface and defect stronger than the identified workspace selection close contract.                                                        |
| 4    | Agent-workspace redesign                                    | Do not promote. This gate promotes a narrow query/close contract on an existing route, not broad workspace IA or visual redesign.                                                                    |
| 5    | Product analytics expansion                                 | Do not promote. No measurement design artifact or explicit product question is repo-custodied for immediate implementation.                                                                          |
| 6    | Observability or monitoring console-noise cleanup           | Do not promote now. Prior gates treated the `403` observation as console noise rather than a proven user-facing blocker.                                                                             |
| 7    | Repo QA MCP tooling                                         | Do not promote as product work. PR `#605` improved execution tooling, and the current repo MCP surface should be used to accelerate this slice, but tooling is not the implementation target here.   |
| 8    | Broad SaaS redesign, broad CRM redesign, or portal redesign | Do not promote. The slice would be too wide and would risk canonical route, auth, tenant, accessibility, localization, and existing E2E contracts without a stronger repo-custodied design artifact. |

## Decision

Promote exactly one bounded implementation slice:

`P27-AGENT01 Agent Workspace Claim Selection Close Contract`

## P27-AGENT01 Draft Design Plan

### Scope

- Existing canonical route: `/agent/workspace/claims`.
- Existing client surface: `AgentClaimsProPage`.
- Existing selection aliases: `selected` and `claimId`.
- Existing E2E proof area: agent workspace claims selection and golden agent pro claims flow.

### Acceptance Criteria

- Direct `/agent/workspace/claims?claimId=<accessible-claim-id>` selection still opens the drawer for an authorized agent.
- Closing the drawer from a `claimId`-selected state removes `claimId` from the URL and closes the drawer.
- Closing the drawer from a `selected`-selected state continues to remove `selected` from the URL and close the drawer.
- If both `selected` and `claimId` are present, closing clears both selection query parameters to avoid stale reselection.
- Inaccessible `claimId` behavior remains unchanged: show the existing not-accessible state, render no selected claim drawer, and expose no message action.
- Preserve current route shape, locale behavior, tenant/agent read boundaries, direct-link behavior, message persistence behavior, claim list behavior, and query parameters unrelated to claim selection.
- Add focused unit or component proof for selection close query handling where practical.
- Extend existing E2E proof so the direct `claimId` selection path verifies drawer close and URL cleanup.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename or bypass canonical routes.
- Do not refactor routing, auth, tenancy architecture, schema, Stripe posture, CRM IA, broad agent workspace, product analytics, README, AGENTS, or architecture docs.

### Suggested Branch

`codex/p27-agent01-workspace-claim-selection-close`

### Verification Standard

- Focused tests for changed behavior.
- Relevant E2E/gate test for `/agent/workspace/claims?claimId=...` close behavior.
- `git diff --check`
- `pnpm verify-slice -- --static`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- Remote PR checks, SonarCloud, Copilot, and PR finalizer green before merge.
