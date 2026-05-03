# P32-DG01 Domain CRM OS Design Gate

## Metadata

- Date: 2026-05-03
- Slice: `P32-DG01`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: promote the first bounded `P32 Domain CRM Operating System` implementation slice without touching product code, routing, auth, tenancy, Stripe, README, AGENTS, or architecture documents.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready` clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing, access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                                                                         | Finding                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fb32f027 fix: align member dashboard support handoffs`                                                                                          | The previous support-handoff alignment landed on `main` before this gate. P32 can start from the member-support handoff concept without reopening the completed member-dashboard copy slice.                               |
| `packages/database/src/schema/claims.ts`                                                                                                         | The canonical claim table already carries tenant, member, agent, branch, assigned staff, status, status timing, and claim-number fields. No `support_handoffs` table or durable support-handoff entity exists.             |
| `packages/database/src/schema/crm.ts` and `packages/database/src/schema/leads.ts`                                                                | Existing CRM tables are agent-led lead, activity, deal, member-activity, and legacy lead surfaces. They do not model member-to-staff support receiving work.                                                               |
| `apps/web/src/app/[locale]/(staff)/staff/_core.entry.tsx`                                                                                        | The staff shell already grants effective portal access to `staff` and `branch_manager`.                                                                                                                                    |
| `apps/web/src/app/[locale]/(staff)/staff/claims/_core.entry.tsx` and `apps/web/src/app/[locale]/(staff)/staff/claims/[id]/page.tsx`              | Branch managers already share staff claim visibility paths but remain bounded to read-only or monitoring semantics; staff perform processing actions.                                                                      |
| `apps/web/src/features/claims/policy/slaPolicy.ts`                                                                                               | Urgency can be derived from existing status, SLA thresholds, waiting-on role, days in stage, and assignment state.                                                                                                         |
| `apps/web/src/features/claims/tracking/memberTrustSummary.ts`                                                                                    | Trust posture is currently derived from claim status and SLA phase. No stored `TrustSignal` entity is required for the first P32 slice.                                                                                    |
| `apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx` and `apps/web/src/app/[locale]/(staff)/staff/claims/[id]/page.tsx` | Claim detail is the current inspectable member/staff matter surface. V1 should keep `Matter` claim-only and avoid introducing a separate matter table.                                                                     |
| `packages/database/src/schema/memberships.ts`                                                                                                    | The only current `relationship` field is family-member metadata, not a CRM relationship table. P32 Relationship should be a read-model projection over member, claim, membership, branch, agent, and support-handoff data. |
| `packages/database/drizzle/meta/_journal.json` and latest drizzle snapshots                                                                      | Schema work must be allocated by a journaled Drizzle migration in the implementation slice, not as raw SQL dropped into the tree.                                                                                          |

## Gate Decisions

1. `support_handoffs` is the new durable handoff entity for P32 unless CRM01 implementation evidence proves a stricter name is required by Drizzle conventions.
2. CRM01 is staff-first. `branch_manager` is included through existing effective staff access and branch scope, but branch-manager actions remain read-only unless a later gate explicitly promotes processing authority.
3. The member trigger is the existing member support handoff CTA/path after the member asks for staff help from the member dashboard or member claim/support context. CRM01 should create a handoff when the member submits that support request, not merely when the page renders.
4. The first CRM01 trigger is member-support handoff receiving. Claim-detail creation is deferred unless needed as a link target for an already-created handoff; direct claim-detail handoff creation requires a later bounded gate.
5. Urgency is server-derived from existing claim/SLA policy: unassigned staff-required claim, SLA breach, stuck threshold breach, waiting-on staff, member action required, and terminal status. Client-submitted urgency must not be trusted.
6. Trust risk is derived, not stored. Initial thresholds should classify risk from existing status/SLA data: high for SLA breach or unassigned staff-required work, medium for stuck or waiting-on-staff work, low for active handling inside thresholds, and informational for terminal or member-action-required work.
7. CRM01 lifecycle is `open` -> `accepted` -> `closed`, with `reassigned` as an auditable transition that preserves the handoff identity. Accept assigns staff ownership, reassign changes the staff owner with actor/reason metadata, and close requires a resolution reason.
8. CRM01 owns the schema migration slot. It should add the journaled Drizzle migration for `support_handoffs` with tenant, member, optional claim, branch, source, derived urgency/trust-risk snapshot labels if needed for queue ordering, lifecycle, staff owner, actor timestamps, and indexes for tenant/status/branch/staff created order. The exact migration number is allocated by `pnpm --filter @interdomestik/database generate --name support_handoffs` during CRM01.
9. Relationship is a read-model projection for V1, not a new table. It should derive from existing member, membership, branch, agent, claim, and support-handoff state.
10. Matter means Claim-only for V1. CRM01 may link a support handoff to an existing claim, but it must not create a separate `matter` table or non-claim matter workflow.
11. No stored `TrustSignal` is authorized. Trust-risk display and ordering must be derived server-side from existing claim/SLA/handoff state unless a later design gate proves a durable signal is required.

## Candidate Ranking

| Rank | Candidate                                        | Decision                                                                                                                                                                                                               |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Staff Member Support Handoff Receiving Queue     | Promote as `P32-CRM01`. It is the narrowest implementation slice that turns the landed member-support handoff into staff-operable CRM work while preserving current routes and staff/branch-manager access boundaries. |
| 2    | Claim-detail handoff creation trigger            | Defer. It is related, but adding a second creation trigger in CRM01 risks widening acceptance criteria before the receiving queue exists.                                                                              |
| 3    | Relationship table                               | Do not promote. V1 Relationship is a projection, not a durable table.                                                                                                                                                  |
| 4    | TrustSignal persistence                          | Do not promote. Existing trust/SLA posture is derived and sufficient for CRM01 ordering and display.                                                                                                                   |
| 5    | Broad CRM operating-system redesign              | Do not promote. It is too wide and would risk route, auth, tenant, schema, and UX drift without the first receiving queue contract.                                                                                    |
| 6    | PR workflow, docs, or tracker automation changes | Do not promote as a product slice. Workflow/documentation changes are explicitly excluded from P32 implementation promotion.                                                                                           |

## Decision

Promote exactly one bounded implementation slice:

`P32-CRM01 Staff Member Support Handoff Receiving Queue`

## P32-DG01 Verification Proof

- Deterministic docs and tracker gates passed locally: `git diff --check`, `pnpm plan:status`,
  `pnpm plan:audit`, `pnpm track:audit`, and `pnpm docs:verify`.
- Static slice verification passed with reviewer pool `security_reviewer`,
  `architect_reviewer`, and `qa_reviewer` at
  `/Users/arbenlila/development/interdomestik-crystal-home/tmp/multi-agent/verify-slice/verify-slice-20260503T145105Z-18f82a`.
- Pre-PR review must-fix findings were closed in this gate: CRM01 now rejects caller-supplied
  ownership fields, derives tenant/member/branch/optional claim/actor identity from authenticated
  server-side state, fails closed without session or tenant identity, verifies member-owned claim
  links server-side, and anchors creation to the route-owned `/member/help` submission path.
- Required gates passed locally with `pnpm verify-slice -- --required-gates` at
  `/Users/arbenlila/development/interdomestik-crystal-home/tmp/multi-agent/verify-slice/verify-slice-20260503T143727Z-75acc1`,
  including `pnpm pr:verify`, `pnpm security:guard`, standalone `pnpm e2e:gate` with 110 passed
  and 4 skipped, fast E2E gate with 65 passed and 1 skipped, smoke gate with 13 passed and 1
  skipped, RLS required coverage, i18n checks, coverage gate at 80.33%, and build size checks.

## P32-CRM01 Draft Design Plan

### Scope

- New `support_handoffs` Drizzle schema and journaled migration.
- Server-only creation path for member support requests from the existing member support handoff entrypoint.
- Session-derived identity binding: CRM01 must derive tenant, member, branch, optional claim,
  and actor identity from the authenticated member session and server-owned records. It must
  reject missing session or tenant identity, reject client-submitted tenant/member/branch/staff
  ownership fields, and only link a claim after proving the claim belongs to the authenticated
  member in the same tenant.
- Canonical member submission owner: the first creation path is the existing `/member/help`
  support route reached from the member dashboard support CTAs. CRM01 should add the route-owned
  support request form and server action there, so the E2E gate can prove member submission,
  staff queue receipt, and preserved `*-page-ready` markers deterministically.
- Staff receiving queue under existing `/staff` access, preserving `branch_manager` visibility through existing staff access and read-only semantics.
- Derived urgency and trust-risk helpers with focused unit tests.
- Accept, reassign, and close lifecycle actions with tenant, branch, staff, actor, and reason guards.
- Queue/detail tests and the required E2E gate spec for existing clarity markers.

### Non-Scope

- `apps/web/src/proxy.ts` changes.
- Canonical route changes or route aliases.
- Auth, tenancy, or effective-access refactors.
- Claim-detail creation trigger, except linking an existing claim to an existing support handoff when already present.
- New `relationship`, `matter`, or `TrustSignal` tables.
- Stripe or billing-provider changes.
- Broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture-doc updates.

### Acceptance Criteria

- Member support request submission creates one tenant-scoped `support_handoffs` row with server-derived urgency/trust-risk semantics.
- Creation derives tenant, member, branch, optional claim, and actor identity from authenticated
  server-side state; missing session/tenant identity fails closed, member-owned claim linking is
  verified server-side, and caller-supplied ownership fields are rejected.
- The creation E2E path starts on `/member/help`, submits the route-owned support request form,
  lands the handoff in the staff receiving queue, and proves existing `*-page-ready` markers stay
  intact.
- Staff can view a receiving queue filtered by tenant, branch, status, owner, urgency, and claim link where applicable.
- Branch managers can see the queue through existing staff access but cannot accept, reassign, close, message, or mutate handoffs unless a later gate expands authority.
- Staff can accept, reassign, and close handoffs with actor, timestamp, and reason metadata.
- Relationship context is rendered as a read-model projection, not stored as a separate table.
- Matter language remains claim-only for V1.
- No stored `TrustSignal`.
- Existing canonical routes and `*-page-ready` markers remain intact.

### Suggested Branch

`codex/p32-crm01-staff-member-support-handoff-receiving-queue`

### Verification Standard

- Focused schema/domain/action/component tests for handoff creation, queue filtering, branch-manager read-only access, and lifecycle mutations.
- E2E gate spec for the receiving queue and existing clarity markers.
- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- `pnpm verify-slice -- --required-gates`
- Remote PR checks, SonarCloud, Copilot, Vercel, and PR finalizer green before merge.
