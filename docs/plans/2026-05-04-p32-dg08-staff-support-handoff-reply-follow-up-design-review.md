# P32-DG08 Staff Support Handoff Reply/Follow-up Design Review

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG08`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: lock the implementation design for the next support-handoff reply/follow-up slice before
  product-code work starts.

## Scope Boundary

This is a design-review and implementation-scope approval slice only. It does not authorize
product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`,
canonical route renames, auth layering changes, tenancy architecture changes outside the existing
support-handoff boundaries, Stripe reintroduction, broad CRM redesign, broad SaaS redesign,
agent-workspace redesign, product analytics expansion, PR workflow changes, README, AGENTS, or
architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                   | Finding                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-04-p32-dg07-post-crm05-next-slice-selection.md`                        | DG07 promoted DG08 because staff can receive and lifecycle-manage support handoffs, and members can see active-handoff advisories, but staff follow-up/reply semantics remain undesigned.                                 |
| `packages/domain-claims/src/support-handoffs/types.ts`                                     | Support handoffs currently have `open`, `accepted`, and `closed` statuses. Reassignment is a lifecycle event, not a status. Contact preference already includes `staff_reply`.                                            |
| `packages/domain-claims/src/support-handoffs/lifecycle.ts`                                 | Staff can accept only `open` handoffs, reassign or close only accepted handoffs assigned to themselves, and branch managers cannot mutate lifecycle state.                                                                |
| `packages/domain-claims/src/support-handoffs/queue.ts`                                     | Staff detail reads expose full member message, lifecycle actor names, close/reassign reasons, and assignment context. Those fields are staff-side operational detail and are too broad for member-facing follow-up reads. |
| `packages/database/src/schema/crm.ts`                                                      | `support_handoffs` has no member-visible response fields today. Existing indexes cover queue and claim/member reads, but no support-handoff reply persistence exists.                                                     |
| `packages/database/src/schema/claims.ts` and `packages/domain-communications/src/messages` | Claim messages are claim-scoped through `claim_messages.claim_id`. They support internal notes and claim access rules, but cannot represent generic `/member/help` handoffs that have no claim.                           |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.tsx`                 | The existing staff queue renders accept/reassign/close actions and a detail panel, but no public response form.                                                                                                           |
| `apps/web/src/app/[locale]/(app)/member/help/_advisory-banner.tsx`                         | The existing member help surface can render member-safe handoff context before the form without blocking submission.                                                                                                      |

## Gate Decisions

1. The next implementation must be a support-handoff-specific public response/follow-up, not a
   claim-message reuse.
2. Existing claim messages remain claim-conversation infrastructure. CRM06 must not write support
   handoff replies into `claim_messages`, because support handoffs can be unlinked from claims and
   claim messages allow internal-note semantics that should not be mixed into member help replies.
3. CRM06 may add a narrow schema migration on `support_handoffs` for one latest member-visible
   public response:
   - `public_response` text, nullable
   - `public_response_at` timestamp, nullable
   - `public_response_by_id` staff user reference, nullable
4. CRM06 must not add a support-handoff conversation table. Multiple-message conversation,
   read-receipts, acknowledgements, and member replies remain deferred until a later gate promotes
   them.
5. A staff public response is allowed only for authenticated `staff` users, within tenant and branch
   scope, on an `accepted` handoff assigned to that staff user.
6. `branch_manager` remains read-only. Branch managers may inspect the public response in detail
   context if they can see the handoff, but they must not create or update it.
7. Sending or updating a public response must not close the handoff. The existing close action and
   staff-only close reason remain separate.
8. Closing a handoff must not expose `closeReason` to members. If staff need member-visible closing
   language, they must send a public response before or separately from closing.
9. The member-facing response read contract may expose only member-safe fields: handoff ID, subject,
   status, public response text, response timestamp, source identifier for localization, and optional
   linked-claim label/status. It must not expose staff IDs, staff names, assignment state, full
   lifecycle reasons, internal notes, close reasons, reassign reasons, or other members' handoffs.
10. Member help should show the latest public response for the authenticated member on the existing
    `/member/help` surface before the form. If a server-validated selected claim exists, the read
    should prefer a public response linked to that claim; otherwise it may show the latest member
    response across support handoffs.
11. The public response is informational and non-blocking. The member support form must remain
    submittable, and CRM05 advisory behavior must remain unchanged.
12. CRM06 does not send notifications. Email, push, in-app notification, unread state,
    acknowledgement, and SLA/response-time commitments are deferred.
13. CRM06 must preserve existing support-handoff creation, source normalization, advisory reads,
    accept/reassign/close lifecycle semantics, branch-manager read-only authority, canonical routes,
    `member-page-ready`, `staff-page-ready`, proxy behavior, auth layering, tenancy architecture,
    Stripe posture, Relationship projection, Matter semantics, and no stored TrustSignal.

## Approved P32-CRM06 Implementation Design

### Slice Goal

Add a bounded staff public response path for accepted support handoffs and show that latest
member-visible response on the existing `/member/help` surface.

### Product-Facing Behavior

- Staff assigned to an accepted support handoff can send or update one public response.
- Staff can still reassign or close accepted handoffs through the existing lifecycle actions.
- Branch managers can inspect support handoff detail but cannot send or update public responses.
- Members returning to `/member/help` can see the latest public response for their handoff context.
- Members can still submit another support request after seeing a public response.

### Data Contract

CRM06 may add one bounded migration that extends `support_handoffs` with nullable public-response
fields:

```ts
publicResponse: text('public_response'),
publicResponseAt: timestamp('public_response_at'),
publicResponseById: text('public_response_by_id').references(() => user.id),
```

No new table is approved for CRM06. No claim-message write is approved for CRM06.

### Staff Write Contract

Add a focused domain function, preferably in
`packages/domain-claims/src/support-handoffs/response.ts`, exported through the existing
support-handoff package boundary.

The function should accept only:

- `tenantId`
- `staffId`
- `branchId`
- `handoffId`
- `expectedVersion`
- `response`

The function must:

- trim and validate response text, with an implementation limit around 2,000 characters
- require `status = 'accepted'`
- require `staff_id = staffId`
- require branch scope when a branch is present
- use `withTenant`
- bump `lifecycleVersion`
- set `updatedAt`, `publicResponse`, `publicResponseAt`, and `publicResponseById`
- log an audit event such as `support_handoff.public_response_sent`
- return a typed action result without exposing staff-only detail

### Member Read Contract

Add a focused member-safe read contract, preferably in the same response module or in a dedicated
member response read module.

Suggested type:

```ts
export type MemberSupportHandoffPublicResponse = {
  handoffId: string;
  subject: string;
  status: 'open' | 'accepted' | 'closed';
  publicResponse: string;
  publicResponseAt: string;
  sourceLabel: string;
  linkedClaim: {
    label: string;
    status: string | null;
  } | null;
};
```

The read function should accept only `{ tenantId, memberId, claimId?: string | null }`, prefer a
server-validated same-claim response when `claimId` is present, otherwise return the latest
member-owned public response. It must filter out rows where `public_response` is null or empty.

### UI Contract

- Add a staff response form on the existing `/staff/support-handoffs` route for accepted handoffs
  assigned to the current staff user.
- Keep the response form out of the existing lifecycle close/reassign forms so public response text
  cannot be confused with staff-only close or reassign reasons.
- Render existing response text in staff detail context.
- Add a member help public-response banner, co-located under `member/help`, that renders before the
  support form and does not wrap or disable the form.
- Keep the CRM05 active-handoff advisory separate from the public-response banner.
- Do not add a new route.

### Copy And Locale Contract

Add localized copy in every supported member-help and staff-support-handoff locale namespace touched
by the implementation. The copy must distinguish:

- public response sent to member
- no public response yet
- member-visible latest response
- response timestamp
- branch-manager read-only behavior
- validation and server-action error states

### Likely Files Touched After Approval

- `packages/database/src/schema/crm.ts`
- next journaled database migration SQL and journal metadata
- `packages/domain-claims/src/support-handoffs/types.ts`
- `packages/domain-claims/src/support-handoffs/response.ts`
- `packages/domain-claims/src/support-handoffs/response.test.ts`
- `packages/domain-claims/src/support-handoffs/index.ts`
- `apps/web/src/actions/support-handoffs/response.ts`
- `apps/web/src/actions/support-handoffs/response.core.ts`
- `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.tsx`
- `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.test.tsx`
- `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.test.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`
- member-help and staff support-handoff locale message files for `en`, `mk`, `sq`, and `sr`
- `apps/web/e2e/gate/staff-support-handoffs.spec.ts`

### Non-Goals

- Member replies or a two-way conversation thread.
- Claim-message writes for support handoff replies.
- Internal staff notes.
- Exposing close reason or reassign reason to members.
- Automatically closing handoffs after response.
- Blocking duplicate support requests.
- Notifications, unread counters, read receipts, acknowledgements, or SLA timers.
- New staff detail routes.
- Broad CRM redesign, Relationship persistence, abstract Matter, stored TrustSignal, Stripe,
  product analytics, proxy changes, canonical route changes, auth or tenancy refactors, README,
  AGENTS, or architecture-doc changes.

### Acceptance Criteria

- Only assigned staff can send or update a public response on accepted support handoffs.
- Branch managers cannot send or update public responses.
- Tenant and branch scoping prevent cross-tenant, cross-branch, unassigned, and wrong-owner writes.
- Response writes use optimistic lifecycle versioning.
- Public response text is not mixed with close/reassign reasons.
- Member-facing reads expose only the public response and member-safe metadata.
- Member-facing reads do not expose staff IDs, staff names, assignment state, close reasons,
  reassign reasons, internal notes, or other members' handoffs.
- Member help renders the latest public response while preserving CRM05 advisory behavior and
  non-blocking form submission.
- Claim-linked handoffs prefer same-claim public responses when the selected claim is server
  validated.
- Generic handoffs without a claim can still receive and display a public response.
- Existing canonical routes and clarity markers remain preserved.
- `apps/web/src/proxy.ts`, auth layering, tenancy architecture, Stripe, Relationship, Matter,
  TrustSignal, README, AGENTS, and architecture docs remain unchanged.

### Verification Standard For P32-CRM06

- Focused domain tests for response validation, tenant/branch/staff scoping, accepted-status
  requirement, wrong-owner rejection, branch-manager rejection, optimistic versioning, audit event,
  and member-safe response read shape.
- Focused migration/schema checks for the added nullable support-handoff response fields.
- Focused staff support-handoff component/action tests for response form visibility, successful
  response, validation failure, branch-manager read-only behavior, and separation from close/reassign
  reason fields.
- Focused member help tests for latest response banner, selected-claim priority, generic handoff
  response, no-response state, and unchanged form submission.
- Locale parity checks for all changed `en`, `mk`, `sq`, and `sr` message files.
- Deterministic E2E proof: member creates handoff, staff accepts and sends public response, member
  revisits `/member/help` and sees the public response, and member can still submit another handoff.
- `git diff --check`
- Focused tests for touched files.
- `pnpm verify-slice -- --static`
- Mandatory implementation reviewer pool.
- `pnpm verify-slice -- --required-gates`
- Playwright MCP or least-risk browser validation for staff response and member response visibility
  when a reachable environment is available.
- Remote PR checks, SonarCloud, Copilot/reviewer comments, Vercel, and PR finalizer green before
  merge.

## P32-DG08 Verification Proof

Local verification is completed on branch `codex/p32-dg08-staff-handoff-reply-design` on
2026-05-04.

| Command                         | Result                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`              | Pass.                                                                                                                                                                                                  |
| `pnpm plan:status`              | Pass.                                                                                                                                                                                                  |
| `pnpm plan:audit`               | Pass.                                                                                                                                                                                                  |
| `pnpm track:audit`              | Pass.                                                                                                                                                                                                  |
| `pnpm docs:verify`              | Pass.                                                                                                                                                                                                  |
| `pnpm verify-slice -- --static` | Pass. Run root: `/private/tmp/interdomestik-p32-dg08/tmp/multi-agent/verify-slice/verify-slice-20260504T160305Z-d0ede3`; selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
