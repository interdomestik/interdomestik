# P32-DG13 Post-CRM08 Next Slice Selection

## Metadata

- Date: 2026-05-05
- Slice: `P32-DG13`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: close `P32-CRM08` after merge and select the next bounded P32 slice.

## Scope Boundary

This is a closeout and next-slice design gate only. It does not authorize product-code changes in
this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth
layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction,
member reply implementation, support-handoff conversation threads, attachments, moderation queues,
SLA timers, support-handoff-specific unread counters, staff acknowledgement notifications, broad CRM
redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, PR workflow
changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                    | Finding                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-05-p32-dg12-response-acknowledgement-design-review.md`                  | DG12 approved a narrow member-authored acknowledgement of the current public-response version and explicitly deferred member replies, conversation threads, SLA timers, queue counters, and staff acknowledgement notifications. |
| PR `#646`, merge commit `ef0ca9628ea9ad9a81e9195c5dbb0530f37e1d50`                          | `P32-CRM08` implemented support-handoff response acknowledgements end to end: schema fields, domain CAS/idempotency, audit logging, member action/UI, staff detail status, i18n, and E2E proof.                                  |
| PR `#647`, merge commit `88aafa06f9488d94c9a8854911e27d454d1cc8ed`                          | Follow-up UX fix keeps acknowledgement on the member help permalink and uses server-formatted localized acknowledgement labels to avoid client/server timestamp drift.                                                           |
| `packages/domain-claims/src/support-handoffs/acknowledgement.ts`                            | Acknowledgement is member-only, tenant/member scoped, current-response-version guarded, idempotent for duplicate acknowledgement, and audit logged only on first acknowledgement of a version.                                   |
| `apps/web/src/app/[locale]/(app)/member/help/_public-response-acknowledgement-form.tsx`     | CRM08 adds a member acknowledgement control but intentionally does not add a reply form, attachments, or a conversation timeline.                                                                                                |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx` | Staff and read-only branch managers can see acknowledgement status in the existing detail panel without gaining a new mutation.                                                                                                  |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                          | The gate proves staff response, member notification, acknowledgement, staff visibility, updated-response awaiting state, and close-path behavior on existing surfaces.                                                           |
| SonarCloud PR `#646` and `#647` reports                                                     | Quality Gate passed with 0 new issues, 0 accepted issues, and 0 security hotspots on both CRM08 and the acknowledgement UX fix.                                                                                                  |

## CRM08 Closeout Decision

`P32-CRM08 Support Handoff Response Acknowledgement` is complete. The shipped implementation
satisfies DG12 by keeping acknowledgement distinct from notification-center `isRead`, binding the
member action to the current public-response version, deriving tenant/member ownership server-side,
preserving branch-manager read-only visibility, avoiding passive read receipts, avoiding member
reply semantics, avoiding SLA or queue-counter semantics, and keeping the existing `/member/help`
and `/staff/support-handoffs` surfaces.

The post-merge acknowledgement UX fix in PR `#647` is part of the CRM08 closeout evidence because it
keeps the member on the targeted `/member/help?handoffId=...` permalink and moves localized
acknowledgement timestamp formatting server-side.

## Candidate Ranking

| Rank | Candidate                                                        | Decision       | Reason                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P32-DG14 Member Support Handoff Reply Semantics Design Review`  | Promote        | CRM06 through CRM08 now support staff public response, member notification, and member acknowledgement, but members still cannot clarify or answer. Reply semantics need a gate before persistence or notification loops are added. |
| 2    | Direct member reply implementation                               | Defer          | A direct implementation would define persistence, moderation, notification, staff workload, closed-handoff behavior, and member/staff visibility rules without an approved design.                                                  |
| 3    | Support-handoff conversation threads with attachments            | Defer          | Full threads and attachments widen the model beyond the smallest next decision, introduce storage and privacy scope, and would likely require more than one implementation slice.                                                   |
| 4    | SLA timers or response-time commitments                          | Defer          | SLA timers create operational promises and measurement semantics beyond the current support-handoff capability.                                                                                                                     |
| 5    | Support-handoff-specific unread counters or queue filters        | Defer          | Generic notification and explicit acknowledgement already cover the pilot awareness loop; queue counters need separate product semantics and should not precede reply-policy design.                                                |
| 6    | New staff support-handoff detail route or broad CRM abstractions | Do not promote | Existing staff support-handoff surfaces remain sufficient for the pilot, and P32 continues to reject broad CRM abstractions absent new repo-custodied evidence.                                                                     |

## Gate Decision

Promote exactly one next bounded design-review slice:

`P32-DG14 Member Support Handoff Reply Semantics Design Review`

The next slice should not implement product code. It should decide whether the product needs a
member-authored reply/follow-up path after staff public responses and acknowledgements, and if so,
define the smallest member-safe, staff-workable, tenant-scoped contract for a later implementation.

## P32-DG14 Review Scope

The promoted design review should answer:

1. Whether a member reply belongs in the support-handoff model at all for the V3 pilot, or whether
   acknowledgement plus new support requests are sufficient.
2. Whether the first reply shape should be one latest member follow-up, a bounded reply record, or a
   deferred full conversation thread.
3. Which handoff statuses allow member replies, and whether closed handoffs remain immutable.
4. Whether replies are staff-visible only on the existing `/staff/support-handoffs` detail panel or
   require any queue indicator in a later implementation.
5. Whether branch managers can read replies and whether they remain read-only.
6. How tenant, member, assigned-staff, branch-manager, and cross-branch boundaries are enforced.
7. Whether staff notifications, member notifications, unread counters, or acknowledgement resets are
   required, and which of those remain deferred.
8. What audit metadata is needed without storing raw sensitive reply text in audit events.
9. Which deterministic domain, action, component, and E2E proofs are required for a later
   implementation slice.

## Non-Goals

- Implementing member replies, conversation threads, attachments, moderation queues, unread
  counters, or SLA timers in this gate.
- Reusing claim messages, internal notes, notifications, or acknowledgement fields as the member
  reply model.
- Automatically reopening, closing, accepting, reassigning, or escalating handoffs after a reply.
- Treating notification-center `isRead` or CRM08 acknowledgement as a reply.
- Adding new member or staff routes.
- Changing support-handoff creation, source normalization, selected-claim validation, CRM05
  advisory reads, CRM06 staff public-response writes, CRM07 notifications, CRM08 acknowledgement
  behavior, staff lifecycle semantics, branch-manager authority, proxy behavior, canonical routes,
  auth layering, tenancy architecture, Stripe posture, Relationship projection, Matter semantics,
  stored TrustSignal posture, README, AGENTS, or architecture docs.

## P32-DG13 Verification Proof

Local verification is completed on branch `codex/p32-dg13-post-crm08-next-slice` on 2026-05-05.

| Command                         | Result |
| ------------------------------- | ------ |
| `git diff --check`              | Pass.  |
| `pnpm plan:status`              | Pass.  |
| `pnpm plan:audit`               | Pass.  |
| `pnpm track:audit`              | Pass.  |
| `pnpm docs:verify`              | Pass.  |
| `pnpm verify-slice -- --static` | Pass.  |

Static verifier evidence:
`run_root=/Users/arbenlila/development/interdomestik-crystal-home/tmp/multi-agent/verify-slice/verify-slice-20260505T141446Z-61e467`;
`selected_reviewers=security_reviewer architect_reviewer qa_reviewer`.

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
