# P32-DG02 Claim-Detail Handoff Creation Trigger Design Review

## Metadata

- Date: 2026-05-03
- Slice: `P32-DG02`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: evaluate the `P32-DG01` deferred claim-detail handoff creation trigger after
  `P32-CRM01` established the staff receiving queue, and promote at most one bounded
  implementation slice without touching product code in this gate.

## Scope Boundary

This is a design-review and tracker-promotion slice only. It does not authorize product-code
changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route
renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe
reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product
analytics expansion, PR workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing
`*-page-ready` clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole
routing, access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                                                                        | Finding                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#619`, merge commit `9c1c9749365f96cc85ff82c948a71609f239fce1`                                                                              | `P32-CRM01` completed the staff-first receiving queue and proved that member support requests can be persisted, queued, accepted, reassigned, and closed without widening proxy, route, auth, tenancy, Stripe, Relationship, Matter, or TrustSignal scope. |
| `packages/database/src/schema/crm.ts` and `packages/database/drizzle/0054_support_handoffs.sql`                                                 | `support_handoffs` already has tenant, member, branch, optional claim, lifecycle, urgency, trust-risk, staff owner, timestamps, and tenant-claim indexes. No schema change is required for a claim-detail trigger.                                         |
| `packages/domain-claims/src/support-handoffs/create.ts`                                                                                         | Creation already derives tenant, member, branch, actor, urgency, and trust-risk server-side, rejects caller-supplied ownership fields, and verifies any submitted claim belongs to the authenticated member in the same tenant.                            |
| `apps/web/src/actions/support-handoffs/create.core.ts`                                                                                          | The web boundary already normalizes a `claimId` input and routes it through the governed domain creation core while revalidating `/member/help` and `/staff/support-handoffs`.                                                                             |
| `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`                                                                                   | `/member/help` already renders the route-owned support request form and a member-owned claim selector, so claim context can be carried into the existing submission path without creating a new route or bypassing the current action boundary.            |
| `apps/web/src/features/claims/tracking/memberTrustSummary.ts` and `apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx` | The member claim detail surface already has a support CTA inside the trust/SLA panel, but its current `supportHref` is `/member/help`, so the CTA loses claim context before the support request is submitted.                                             |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                                                                              | The current E2E gate proves generic member help submission reaches the staff queue. A follow-up can extend this with a claim-detail-started scenario that proves the handoff is linked to the originating claim.                                           |

## Gate Decisions

1. The claim-detail trigger is now eligible for a bounded implementation slice because CRM01
   established the receiving queue, persistence model, claim-link storage, queue rendering, and
   lifecycle actions.
2. The next implementation should reuse the existing `support_handoffs` persistence and
   `createMemberSupportHandoffCore` boundary. It must not create a second support entity, new
   Relationship table, abstract Matter system, stored TrustSignal, or new CRM workflow.
3. The trigger must be member-intent based. Visiting a claim detail page or clicking a support
   link must not create a handoff by itself. Creation happens only when the member submits the
   support request.
4. The implementation should start on the existing canonical member claim detail surface and carry
   the originating claim into the route-owned `/member/help` support request path. The member must
   see the claim context before submitting.
5. The existing server boundary remains authoritative for identity and ownership. Client-provided
   tenant, member, branch, staff, urgency, trust-risk, status, or actor fields remain forbidden;
   claim linkage remains server-verified against the authenticated member and tenant.
6. No schema migration is promoted by this gate. The current `support_handoffs.claim_id` column,
   source text, and tenant-claim index are sufficient for the next slice.
7. Relationship remains a read-model projection, Matter remains claim-only for V1, and trust risk
   remains derived server-side from current claim/SLA/handoff state.

## Candidate Ranking

| Rank | Candidate                                                  | Decision                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Claim-detail initiated support handoff trigger             | Promote as `P32-CRM02`. It is the narrowest post-CRM01 product slice because the claim detail page already has a support CTA and the existing governed creation path already supports optional verified claim linkage. |
| 2    | One-click handoff creation directly from claim detail      | Do not promote. Creating on click would risk accidental support work creation and bypass the route-owned support request form's explicit member-submitted detail capture.                                              |
| 3    | New support-handoff schema fields or source enum migration | Do not promote. The current text `source`, optional `claim_id`, and indexes are sufficient for the bounded trigger.                                                                                                    |
| 4    | Staff-side claim-detail support handoff detail panel       | Defer. CRM01 already renders linked claim context in the queue; a richer detail panel is not required before the claim-detail trigger exists.                                                                          |
| 5    | Relationship table                                         | Do not promote. Relationship remains a projection over member, membership, branch, agent, claim, and support-handoff state.                                                                                            |
| 6    | TrustSignal persistence                                    | Do not promote. Trust risk remains derived and no durable signal is needed for the trigger.                                                                                                                            |
| 7    | Broad CRM operating-system redesign                        | Do not promote. It is wider than the evidenced claim-detail trigger and risks route, auth, tenant, UX, and schema drift.                                                                                               |
| 8    | PR workflow, docs, or tracker automation changes           | Do not promote as product work. Workflow automation remains separate from P32 product slices.                                                                                                                          |

## Decision

Promote exactly one bounded implementation slice:

`P32-CRM02 Claim-Detail Support Handoff Trigger`

## P32-DG02 Verification Proof

- Deterministic docs and tracker gates passed locally: `git diff --check`, `pnpm plan:status`,
  `pnpm plan:audit`, `pnpm track:audit`, and `pnpm docs:verify`.
- Static slice verification passed with reviewer pool `security_reviewer`,
  `architect_reviewer`, and `qa_reviewer` at
  `/Users/arbenlila/development/interdomestik-crystal-home/tmp/multi-agent/verify-slice/verify-slice-20260503T192316Z-c72bc2`.
- Required gates passed locally with `pnpm verify-slice -- --required-gates` at
  `/Users/arbenlila/development/interdomestik-crystal-home/tmp/multi-agent/verify-slice/verify-slice-20260503T192325Z-8fc2ea`,
  including `pnpm pr:verify`, `pnpm security:guard`, fast E2E gate with 66 passed and
  1 skipped, smoke E2E with 13 passed and 1 skipped, standalone `pnpm e2e:gate` with
  112 passed and 4 skipped, RLS required coverage, i18n checks, coverage gate at 80.49%,
  and build size checks.

## P32-CRM02 Draft Design Plan

### Scope

- Make the existing member claim detail support CTA claim-context aware.
- Carry the originating claim into the existing `/member/help` support request form without
  creating a handoff on page render or link click.
- Validate and render the selected claim context server-side on `/member/help` using the existing
  authenticated member-owned claim query.
- Reuse `createMemberSupportHandoffCore` for submission, server-derived ownership, branch routing,
  urgency/trust-risk derivation, audit logging, and staff queue revalidation.
- Prove the staff receiving queue shows the handoff linked to the originating claim.
- Add focused unit/component and E2E coverage for the member claim-detail-to-staff-queue path.

### Non-Scope

- `apps/web/src/proxy.ts` changes.
- Canonical route changes or route aliases.
- Auth, tenancy, effective-access, or routing refactors.
- New `support_handoffs` schema migration or a separate source enum migration.
- New Relationship table, abstract Matter system, or stored TrustSignal.
- Branch-manager mutation authority changes.
- Staff queue lifecycle changes beyond proving the linked claim appears.
- Stripe, billing-provider, product analytics, broad CRM redesign, broad SaaS redesign,
  agent-workspace redesign, README, AGENTS, or architecture-doc updates.

### Acceptance Criteria

- A member can start from an owned claim detail page, choose the support CTA, submit the existing
  support request form with that claim context, and create one tenant-scoped `support_handoffs`
  row linked to the originating claim.
- Claim context is displayed before submission and is server-validated against the authenticated
  member and tenant; cross-member or cross-tenant claim IDs fail closed or are ignored before
  submission, and the domain creation core still rejects unauthorized claim linkage.
- No handoff is created on page render, claim-detail page load, or support CTA click alone.
- Staff can find the resulting handoff in `/staff/support-handoffs` and see the linked claim
  context already supported by CRM01.
- Existing canonical routes and `*-page-ready` markers remain intact.
- `apps/web/src/proxy.ts`, auth layering, tenancy architecture, Stripe, Relationship persistence,
  Matter persistence, TrustSignal persistence, README, AGENTS, and architecture-doc files remain
  unchanged.

### Suggested Branch

`codex/p32-crm02-claim-detail-support-handoff-trigger`

### Verification Standard

- Focused unit/component tests for claim-detail support href/context rendering and `/member/help`
  claim preselection behavior.
- Focused domain/action tests proving claim ownership checks remain server-derived and forbidden
  ownership fields remain rejected.
- E2E gate scenario that starts on a member claim detail page, submits a claim-linked support
  handoff, and proves staff queue receipt with linked claim context.
- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- `pnpm verify-slice -- --required-gates`
- Remote PR checks, SonarCloud, Copilot, Vercel, and PR finalizer green before merge.
