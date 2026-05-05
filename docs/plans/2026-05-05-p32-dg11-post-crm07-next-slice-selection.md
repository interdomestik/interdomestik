# P32-DG11 Post-CRM07 Next Slice Selection

## Metadata

- Date: 2026-05-05
- Slice: `P32-DG11`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: close `P32-CRM07` after merge and select the next bounded P32 slice.

## Scope Boundary

This is a closeout and next-slice design gate only. It does not authorize product-code changes in
this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth
layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction,
support-handoff-specific unread counters, read receipts, acknowledgements, member replies,
conversation threads, SLA timers, broad CRM redesign, broad SaaS redesign, agent-workspace redesign,
product analytics expansion, PR workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                       | Finding                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#643`, merge commit `8b56bd563d3f48ee7fb81080019aceed0b42f197`             | `P32-CRM07` landed on `main` as the support-handoff public-response in-app notification implementation.                                                                                                                      |
| `packages/domain-communications/src/notifications/notify.ts`                   | CRM07 added the `support_handoff_public_response` notification type, keeps the channel in-app only, uses deterministic IDs, and explicitly defers acknowledgements, read receipts, member replies, and conversation threads. |
| `apps/web/src/actions/support-handoffs/response.core.ts`                       | Public-response notification dispatch happens after a successful assigned-staff public-response write and targets the existing localized `/member/help` surface with the originating handoff ID.                             |
| `apps/web/src/actions/support-handoffs/lifecycle.core.ts`                      | Closing a handoff clears public-response notifications for that handoff so members are not sent to a closed-handoff state with no visible public response.                                                                   |
| `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.tsx`      | CRM07 supports handoff-targeted member reads while preserving the existing member help surface and CRM06 member-safe public-response boundary.                                                                               |
| `apps/web/src/components/notifications/notification-center.tsx`                | Existing generic notification-center read state remains available, but CRM07 did not redefine it as support-handoff acknowledgement, read receipt, SLA state, or member-response state.                                      |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                             | CRM07 proves staff public response notification display, notification action routing to the targeted member help surface, updated response visibility, and stale notification suppression after close.                       |
| `docs/plans/2026-05-04-p32-dg10-public-response-notification-design-review.md` | DG10 intentionally deferred support-handoff-specific unread counters, read receipts, acknowledgements, SLA timers, member replies, and conversation threads beyond the first in-app notification slice.                      |
| SonarCloud PR `#643` report                                                    | Quality Gate passed. No Sonar security hotspot or blocking quality-gate issue remained before merge.                                                                                                                         |
| PR `#643` Vercel status                                                        | Vercel preview was skipped by the ignored build policy, consistent with recent repo PR behavior.                                                                                                                             |

## CRM07 Closeout Decision

`P32-CRM07 Support Handoff Public Response In-App Notification` is complete. The shipped
implementation satisfies the DG10 contract by creating member-scoped in-app notifications after
successful assigned-staff public-response writes, deriving notification recipient and payload from
tenant-scoped handoff data, linking members back to the existing `/member/help` surface, preserving
CRM05 advisory behavior and CRM06 public-response display, and avoiding email, push, new queues,
support-handoff-specific unread counters, read receipts, acknowledgements, SLA timers, member
replies, conversation threads, schema changes, proxy changes, route changes, auth refactors, and
tenancy refactors.

CRM07 also resolved the four Copilot review findings before merge: notification links now carry the
originating handoff ID, member reads can target that handoff without falling back to unrelated active
handoffs, close clears stale public-response notifications, and the E2E gate uses real Playwright
actionability plus post-close notification suppression proof.

## Candidate Ranking

| Rank | Candidate                                                         | Decision       | Reason                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P32-DG12 Support Handoff Response Acknowledgement Design Review` | Promote        | CRM07 gives members passive notification-center awareness, but intentionally does not define whether a member can explicitly acknowledge a staff response or whether staff can see that acknowledgement. The semantics need a gate first. |
| 2    | Direct acknowledgement or read-receipt implementation             | Defer          | Implementing acknowledgement/read semantics without a gate would blur generic notification read state, staff-visible acknowledgement, response lifecycle, audit policy, and member privacy semantics.                                     |
| 3    | Member replies or two-way support-handoff conversation threads    | Defer          | Replies require separate persistence, moderation, staff workload policy, notification loops, lifecycle behavior, and member/staff visibility rules.                                                                                       |
| 4    | SLA timers or response-time commitments                           | Defer          | SLA timers create operational promises and measurement semantics beyond current member support-handoff capability.                                                                                                                        |
| 5    | Support-handoff-specific unread counters                          | Defer          | Generic notification unread state already exists. A support-handoff-specific counter needs product semantics and may not be the smallest next workflow improvement.                                                                       |
| 6    | New staff support-handoff detail route or broad CRM abstractions  | Do not promote | Existing staff support-handoff surfaces remain sufficient for the pilot, and P32 continues to reject broad CRM abstractions absent new repo-custodied evidence.                                                                           |

## Gate Decision

Promote exactly one next bounded design-review slice:

`P32-DG12 Support Handoff Response Acknowledgement Design Review`

The next slice should not implement product code. It should decide whether the product needs a
member-authored acknowledgement distinct from generic notification read state, and if so, define the
smallest member-safe, staff-visible, tenant-scoped contract for a later implementation.

## P32-DG12 Review Scope

The promoted design review should answer:

1. Whether generic notification `isRead` is sufficient for CRM07, or whether support handoffs need a
   separate member acknowledgement state.
2. If acknowledgement is needed, whether it is member-authored, staff-visible, audit logged,
   timestamped, clearable, or single-use.
3. Whether acknowledgement belongs on the existing `/member/help` response banner, notification
   center item, or both.
4. Whether staff can see acknowledgement on the existing `/staff/support-handoffs` detail panel, and
   which staff or branch-manager roles may see it.
5. Whether acknowledgement should be allowed only while the handoff is `open` or `accepted`, or
   whether closed handoffs stay immutable.
6. How tenant, member, handoff, assigned-staff, and branch-manager read-only boundaries are enforced.
7. Whether any schema, audit, or notification changes are required. No schema or index work is
   authorized until the design review explicitly promotes it.
8. Which deterministic domain, action, component, and E2E proofs are required for a later
   implementation slice.

## Non-Goals

- Implementing acknowledgement, read receipts, member replies, conversation threads, SLA timers, or
  support-handoff-specific unread counters in this gate.
- Treating generic notification-center `isRead` as a support-handoff read receipt.
- Changing support-handoff public response write/read behavior.
- Exposing staff-only close or reassign reasons to members.
- Automatically closing handoffs after acknowledgement.
- Blocking duplicate support requests.
- Adding broad CRM redesign, Relationship persistence, abstract Matter, stored TrustSignal, or new
  staff detail routes.
- Changing support-handoff creation, source normalization, selected-claim validation, advisory
  reads, staff lifecycle semantics, branch-manager authority, proxy behavior, canonical routes, auth
  layering, tenancy architecture, schema, Stripe posture, README, AGENTS, or architecture docs.

## P32-DG11 Verification Proof

Local verification is completed on branch `codex/p32-dg11-post-crm07-next-slice` on 2026-05-05.

| Command                         | Result |
| ------------------------------- | ------ |
| `git diff --check`              | Pass.  |
| `pnpm plan:status`              | Pass.  |
| `pnpm plan:audit`               | Pass.  |
| `pnpm track:audit`              | Pass.  |
| `pnpm docs:verify`              | Pass.  |
| `pnpm verify-slice -- --static` | Pass.  |

Static verifier evidence:
`run_root=/private/tmp/interdomestik-p32-dg10/tmp/multi-agent/verify-slice/verify-slice-20260505T073613Z-0792ea`;
`selected_reviewers=security_reviewer architect_reviewer qa_reviewer`.

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
