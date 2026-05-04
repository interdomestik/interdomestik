# P32-DG09 Post-CRM06 Next Slice Selection

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG09`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: close `P32-CRM06` after merge and select the next bounded P32 slice.

## Scope Boundary

This is a closeout and next-slice design gate only. It does not authorize product-code changes in
this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth
layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction,
notification implementation, read receipts, acknowledgements, member replies, conversation threads,
broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, PR
workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                         | Finding                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR `#638`, merge commit `0183b354f0ab25c639888c7eab3da95b6ed0eb0b`                               | `P32-CRM06` landed on `main` as the staff support-handoff public response implementation.                                                                                                        |
| Commit `e916e8a8184c03e42e038b0567604cc923eb87ef`                                                | CRM06 review findings were addressed before merge: the staff response form refreshes detail state/version after submit, and the member latest-response read path has a supporting partial index. |
| `packages/domain-claims/src/support-handoffs/response.ts`                                        | CRM06 added support-handoff-specific public response write/read contracts rather than reusing claim messages.                                                                                    |
| `packages/database/drizzle/0055_brown_deathstrike.sql` and `packages/database/src/schema/crm.ts` | CRM06 added bounded public-response persistence and a supporting latest-response index on `support_handoffs`.                                                                                    |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx`      | CRM06 added assigned-staff public response UI on the existing staff support-handoff route while preserving separate accept/reassign/close lifecycle controls.                                    |
| `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.tsx`                        | CRM06 renders the latest member-safe public response on `/member/help` without blocking support submission.                                                                                      |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                               | CRM06 added deterministic gate proof that a member-created handoff can be accepted, receive a staff public response, show that response to the member, and still allow another support request.  |
| `docs/plans/2026-05-04-p32-dg08-staff-support-handoff-reply-follow-up-design-review.md`          | DG08 intentionally deferred notifications, unread state, read receipts, acknowledgements, SLA commitments, member replies, and conversation threads until a later gate promotes them.            |
| SonarCloud PR `#638` report                                                                      | Quality Gate passed. Sonar reported one new issue and zero accepted issues; no security hotspots were reported.                                                                                  |
| PR `#638` Vercel status                                                                          | Vercel preview was skipped by the ignored build policy, consistent with recent repo PR behavior.                                                                                                 |

## CRM06 Closeout Decision

`P32-CRM06 Staff Support Handoff Public Response` is complete. The shipped implementation satisfies
the DG08 contract by adding a bounded support-handoff-specific public response path for accepted
handoffs assigned to the current staff user, keeping branch managers read-only, separating public
response text from staff-only close/reassign reasons, exposing only member-safe latest-response
metadata on `/member/help`, preserving CRM05 advisory behavior and non-blocking support
submission, and proving the staff-to-member response flow in the existing E2E gate.

CRM06 also resolved the two Copilot review findings before merge: public response detail is
refetched after a successful submit so optimistic versioning stays current, and the member
latest-response query gained a partial supporting index. Notifications, unread state, read
receipts, acknowledgements, member replies, conversation threads, and SLA commitments remain
deferred.

## Candidate Ranking

| Rank | Candidate                                                                  | Decision       | Reason                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P32-DG10 Support Handoff Public Response Notification Design Review`      | Promote        | Members can now see staff public responses when they revisit `/member/help`, but CRM06 deliberately does not notify them or define unread/acknowledgement semantics. A design gate should lock that policy first. |
| 2    | Direct support-handoff notification implementation                         | Defer          | Implementation would require decisions about delivery channels, verified-recipient rules, idempotency, event timing, localization, unread state, and whether closed handoffs should still notify members.         |
| 3    | Member replies or two-way support-handoff conversation threads             | Defer          | CRM06 intentionally shipped one latest staff public response. Two-way conversations need separate persistence, access, moderation, notification, and lifecycle policy.                                            |
| 4    | Read receipts, acknowledgements, or SLA timers                             | Defer          | These create operational promises and measurement semantics beyond the current public-response surface.                                                                                                           |
| 5    | New staff support-handoff detail route                                     | Do not promote | CRM03 and CRM06 improved the existing staff support-handoff route. A new route is not the next smallest missing workflow.                                                                                         |
| 6    | Broad CRM, Relationship table, abstract Matter, or stored TrustSignal work | Do not promote | P32 has repeatedly rejected broad CRM redesign and these abstractions for the pilot. No new repo evidence changes that boundary.                                                                                  |

## Gate Decision

Promote exactly one next bounded design-review slice:

`P32-DG10 Support Handoff Public Response Notification Design Review`

The next slice should not implement product code. It should decide the smallest notification and
awareness contract that can be safely implemented later for CRM06 public responses.

## P32-DG10 Review Scope

The promoted design review should answer:

1. Whether support-handoff public responses notify members by email, in-app notification, push, or a
   smaller first channel.
2. Which mutation event triggers notification: first response only, every update, response before
   close, or response after close.
3. How verified-recipient, tenant/member scoping, locale selection, and idempotency are enforced.
4. Whether unread state, read receipts, acknowledgements, and SLA timers remain out of scope.
5. Whether branch managers stay read-only and whether staff-only close/reassign reasons remain
   excluded from notification content.
6. Which member-safe fields may appear in notification payloads and templates.
7. Whether any schema, queue, or notification-log extension is required. No schema/index work is
   authorized until the design review explicitly promotes it.
8. Which deterministic unit, integration, E2E, and gate proofs are required for a later
   implementation slice.

## Non-Goals

- Implementing notifications, unread counters, read receipts, acknowledgements, member replies, or
  conversation threads in this gate.
- Changing support-handoff public response write/read behavior.
- Exposing staff-only close or reassign reasons to members.
- Automatically closing handoffs after response.
- Blocking duplicate support requests.
- Adding broad CRM redesign, Relationship persistence, abstract Matter, stored TrustSignal, or new
  staff detail routes.
- Changing support-handoff creation, source normalization, selected-claim validation, advisory
  reads, staff lifecycle semantics, branch-manager authority, proxy behavior, canonical routes, auth
  layering, tenancy architecture, schema, Stripe posture, README, AGENTS, or architecture docs.

## P32-DG09 Verification Proof

Local verification is completed on branch `codex/p32-crm06-closeout` on 2026-05-04.

| Command                         | Result                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`              | Pass.                                                                                                                                                              |
| `pnpm plan:status`              | Pass.                                                                                                                                                              |
| `pnpm plan:audit`               | Pass.                                                                                                                                                              |
| `pnpm track:audit`              | Pass.                                                                                                                                                              |
| `pnpm docs:verify`              | Pass.                                                                                                                                                              |
| `pnpm verify-slice -- --static` | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T180705Z-47cdad`; selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
