# P32-DG07 Post-CRM05 Next Slice Selection

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG07`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: close `P32-CRM05` after merge and select the next bounded P32 slice.

## Scope Boundary

This is a closeout and next-slice design gate only. It does not authorize product-code changes in
this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth
layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction,
staff reply implementation, broad CRM redesign, broad SaaS redesign, agent-workspace redesign,
product analytics expansion, PR workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                          | Finding                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#635`, merge commit `6867fe96130f5be9c147ee81e6c6c3ac0f428a92`                | `P32-CRM05` landed on `main` as the member-side duplicate open-handoff advisory implementation.                                                                                                                                                             |
| `packages/domain-claims/src/support-handoffs/advisory.ts`                         | CRM05 added a member-safe tenant/member-scoped advisory read contract using active `open` and `accepted` statuses, same-claim priority, active count, and bounded claim/status/source/timestamp output.                                                     |
| `packages/domain-claims/src/support-handoffs/types.ts`                            | CRM05 added the named member advisory DTO and active-status constant instead of reusing staff queue/detail DTOs.                                                                                                                                            |
| `apps/web/src/app/[locale]/(app)/member/help/_advisory-banner.tsx`                | CRM05 renders localized, non-blocking claim-specific and generic member-level advisory branches before the member support form.                                                                                                                             |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                | CRM05 added deterministic member-side proof that an active handoff shows the advisory and that a second support request remains submittable.                                                                                                                |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.tsx`        | Staff can inspect, accept, reassign, and close support handoffs, but the support-handoff surface still lacks a designed member-visible staff reply or follow-up workflow.                                                                                   |
| `packages/domain-communications/src/messages` and message action surfaces         | Tenant-scoped member/staff messaging primitives already exist for claim conversations, but the repo does not yet define whether support-handoff follow-up should reuse those primitives, create support-handoff-specific replies, or remain lifecycle-only. |
| `docs/plans/2026-05-04-p32-dg05-post-crm04-next-slice-selection.md`               | DG05 ranked staff reply/add-note behind the duplicate advisory because reply semantics needed a separate design decision.                                                                                                                                   |
| `docs/plans/2026-05-04-p32-dg06-duplicate-open-handoff-advisory-design-review.md` | DG06 explicitly excluded staff reply workflows and deferred the optional advisory index until separately authorized.                                                                                                                                        |

## CRM05 Closeout Decision

`P32-CRM05 Duplicate Open-Handoff Advisory Guard` is complete. The shipped implementation satisfies
the DG05/DG06 contract by adding non-blocking member-side advisory visibility for active `open` or
`accepted` support handoffs, excluding `closed`, prioritizing selected server-validated claim
matches, preserving generic member-level copy on `/member/help`, keeping the support form
submittable, localizing advisory copy, preserving support-handoff creation behavior, and proving the
member-safe field boundary and E2E path.

The possible `(tenant_id, member_id, status)` support-handoff index remains deferred. CRM05 shipped
without a page-load performance finding that would justify promoting schema/index work ahead of the
next product-facing workflow gap.

## Candidate Ranking

| Rank | Candidate                                                             | Decision       | Reason                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P32-DG08 Staff Support Handoff Reply/Follow-up Design Review`        | Promote        | Staff can receive and lifecycle-manage handoffs, and members can now see active-handoff advisories, but staff follow-up/reply semantics remain undesigned. The next step should lock reply policy before implementation. |
| 2    | Direct staff support-handoff reply implementation                     | Defer          | Implementation would require decisions about member visibility, persistence model, notifications, close/reopen semantics, and whether existing claim messages can be reused.                                             |
| 3    | Support-handoff advisory composite index                              | Defer          | No CRM05 performance evidence requires a schema/index optimization now, and DG06 deferred index DDL until separately authorized.                                                                                         |
| 4    | Hard duplicate blocking or escalation policy                          | Defer          | CRM05 intentionally kept advisory behavior non-blocking. Blocking duplicate requests remains policy-heavy and should not be introduced without explicit product/legal operating rules.                                   |
| 5    | New staff support-handoff detail route                                | Do not promote | CRM03 already added on-demand detail context on the existing staff support-handoff route. A new route is not the next smallest missing workflow.                                                                         |
| 6    | Broad CRM, Relationship table, abstract Matter, or stored TrustSignal | Do not promote | P32 has repeatedly rejected broad CRM redesign and these abstractions for the pilot. No new repo evidence changes that boundary.                                                                                         |

## Gate Decision

Promote exactly one next bounded design-review slice:

`P32-DG08 Staff Support Handoff Reply/Follow-up Design Review`

The next slice should not implement product code. It should decide the smallest support-handoff
reply/follow-up contract that can be safely implemented later.

## P32-DG08 Review Scope

The promoted design review should answer:

1. Whether staff follow-up should reuse the existing claim messaging primitives, introduce
   support-handoff-specific reply persistence, or use a lifecycle-only response model.
2. Which staff response fields are member-visible and which remain staff-only.
3. Whether member notifications are in scope for the first reply implementation or deferred.
4. How reply/follow-up behaves across `open`, `accepted`, `reassigned`, and `closed` handoffs.
5. Whether branch managers remain read-only for reply/follow-up surfaces.
6. How tenant/member/staff scoping is enforced and how internal notes are prevented from leaking.
7. Whether any schema or index change is needed. No schema/index work is authorized until the design
   review explicitly promotes it.
8. Which deterministic unit, component, E2E, and gate proofs are required for the later
   implementation slice.

## Non-Goals

- Implementing staff reply, add-note, notification, or member response UI in this gate.
- Hard-blocking duplicate support requests.
- Adding the possible support-handoff advisory index.
- Adding broad CRM redesign, Relationship persistence, abstract Matter, stored TrustSignal, or new
  staff detail routes.
- Changing support-handoff creation, source normalization, selected-claim validation, urgency or
  trust-risk derivation, staff lifecycle semantics, branch-manager authority, proxy behavior,
  canonical routes, auth layering, tenancy architecture, schema, Stripe posture, README, AGENTS, or
  architecture docs.

## P32-DG07 Verification Proof

Local verification is completed on branch `codex/p32-dg07-post-crm05-next-slice` on 2026-05-04.

| Command                         | Result                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`              | Pass.                                                                                                                                                              |
| `pnpm plan:status`              | Pass.                                                                                                                                                              |
| `pnpm plan:audit`               | Pass.                                                                                                                                                              |
| `pnpm track:audit`              | Pass.                                                                                                                                                              |
| `pnpm docs:verify`              | Pass.                                                                                                                                                              |
| `pnpm verify-slice -- --static` | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T153952Z-2f3dfc`; selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, schema files, Stripe surfaces, README, AGENTS, and architecture docs must not be
changed by this design gate.
