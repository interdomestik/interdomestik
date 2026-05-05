# P32-DG12 Support Handoff Response Acknowledgement Design Review

## Metadata

- Date: 2026-05-05
- Slice: `P32-DG12`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: lock the implementation design for member-authored acknowledgement of a staff public
  support-handoff response.

## Scope Boundary

This is a design-review and implementation-scope approval slice only. It does not implement product
code in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames,
auth layering changes, tenancy architecture changes, Stripe reintroduction, email delivery, push
delivery, member replies, two-way support-handoff conversation threads, SLA timers,
support-handoff-specific unread counters, passive read receipts, automatic acknowledgement on view,
new staff routes, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product
analytics expansion, PR workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                    | Finding                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-05-p32-dg11-post-crm07-next-slice-selection.md`                         | DG11 promoted this design review because CRM07 delivered passive in-app notification awareness but intentionally left acknowledgement semantics unresolved.                                                                |
| PR `#643`, merge commit `8b56bd563d3f48ee7fb81080019aceed0b42f197`                          | CRM07 creates tenant-scoped in-app notifications for successful public response writes, links members back to `/member/help`, and clears stale response notifications when the handoff closes.                             |
| `packages/domain-communications/src/notifications/notify.ts`                                | `support_handoff_public_response` notifications are in-app only and deterministic by handoff plus `publicResponseVersion`; the implementation explicitly keeps acknowledgements and support-handoff-specific unread out.   |
| `packages/domain-communications/src/notifications/get.ts`                                   | Notification reads are scoped by tenant and current user and return generic notification-center records only.                                                                                                              |
| `packages/domain-communications/src/notifications/mark-read.ts`                             | `isRead` is updated for notification rows owned by the current user. It is generic notification UI state, not handoff workflow state, staff-visible state, or member intent.                                               |
| `apps/web/src/components/notifications/notification-center.tsx`                             | Members can mark notification rows read or open the action URL, but this does not prove that the member read the current public response or intentionally acknowledged it.                                                 |
| `packages/domain-claims/src/support-handoffs/response.ts`                                   | Public response writes are accepted-handoff, tenant, branch, assigned-staff, and `publicResponseVersion` guarded. The response version is the right boundary for acknowledging the current response only.                  |
| `packages/domain-claims/src/support-handoffs/types.ts`                                      | Member public-response reads expose only `publicResponse` and `publicResponseAt`; staff detail reads already expose a separate public-response sub-object.                                                                 |
| `packages/database/src/schema/crm.ts`                                                       | `support_handoffs` has response-specific fields and a public-response length check, but no member-authored acknowledgement fields.                                                                                         |
| `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.tsx`                   | The existing member-safe response banner is the natural acknowledgement entry point because it is where the full current public response is visible.                                                                       |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx` | The existing staff detail panel is the natural staff visibility surface because it already shows the public response and branch-manager read-only detail without a new route.                                              |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                          | Current gate coverage proves notification display, action routing to the targeted member help surface, updated response visibility, branch-manager read-only response visibility, and close-path notification suppression. |

## Gate Decisions

1. Generic notification-center `isRead` is insufficient for support-handoff response
   acknowledgement. It can mean a member dismissed or opened a notification, but it does not carry
   member-authored intent and is not staff-visible support-handoff state.
2. The next implementation slice should add an explicit member-authored acknowledgement for the
   current staff public response version.
3. Acknowledgement must be a support-handoff field set, not a notification row mutation, claim
   message, internal note, member reply, or lifecycle close.
4. Acknowledgement is version-specific. A member acknowledgement for response version `1` must not
   imply acknowledgement of response version `2` after staff update the public response.
5. Acknowledgement is allowed only for the handoff's member, in the same tenant, while the handoff is
   active (`open` or `accepted`) and has a current public response.
6. The member mutation must accept only `handoffId` and `expectedPublicResponseVersion` from the
   browser. It must derive tenant, member, status, current public response, and current response
   version server-side.
7. Duplicate acknowledgement of the same current response version should be idempotent for the
   member UX and must not create duplicate audit events.
8. Staff and branch managers may see acknowledgement status in the existing staff support-handoff
   detail panel. Branch managers remain read-only.
9. Acknowledgement must not automatically close a handoff, create a staff notification, mark generic
   notification rows read, satisfy an SLA, create a read receipt, create a reply thread, block
   duplicate support requests, or change CRM05 advisory behavior.
10. A bounded schema extension on `support_handoffs` is approved for the later implementation slice:
    current-response acknowledgement timestamp, actor, and acknowledged public-response version.
11. New staff routes, queue-wide acknowledgement counters, filters, notification-center
    acknowledgement buttons, support-handoff-specific unread counters, member reply forms, and SLA
    timers remain deferred.

## Approved P32-CRM08 Implementation Design

### Slice Goal

Let a member explicitly acknowledge the latest staff public response on an active support handoff,
and let staff see whether the current public response version has been acknowledged, without
confusing that action with notification read state or member replies.

### Product-Facing Behavior

- The member sees the existing public response banner on `/member/help`.
- If the current public response version is not acknowledged by that member, the banner shows one
  small action: `Acknowledge update`.
- Submitting acknowledgement disables the control while pending and then shows acknowledged state
  with a localized timestamp.
- If staff later update the public response, the previous acknowledgement remains historical but the
  current version becomes unacknowledged until the member acknowledges again.
- Staff and branch managers can inspect acknowledgement status in the existing
  `/staff/support-handoffs` detail panel near the public response.
- Branch managers remain read-only. Staff do not get an acknowledgement mutation.

### Data Model Contract

The later implementation may add these nullable columns to `support_handoffs`:

```ts
publicResponseAcknowledgedAt: timestamp('public_response_acknowledged_at'),
publicResponseAcknowledgedById: text('public_response_acknowledged_by_id').references(() => user.id),
publicResponseAcknowledgedVersion: integer('public_response_acknowledged_version'),
```

The implementation should treat the current response as acknowledged only when:

```ts
publicResponseAcknowledgedById === memberId &&
  publicResponseAcknowledgedVersion === publicResponseVersion;
```

The implementation should not reset acknowledgement columns when staff update the public response.
Version comparison is enough to show that the latest response is awaiting acknowledgement while
preserving the last acknowledgement timestamp for audit and display.

No separate acknowledgement history table, notification table, outbox, queue, unread counter, or SLA
table is approved for CRM08.

### Domain Contract

Add a focused member-side domain module, preferably
`packages/domain-claims/src/support-handoffs/acknowledgement.ts`, exported through the existing
support-handoff package boundary.

Suggested input shape:

```ts
type AcknowledgeSupportHandoffPublicResponseInput = {
  handoffId: string;
  expectedPublicResponseVersion: number;
};
```

Suggested result shape:

```ts
type AcknowledgeSupportHandoffPublicResponseResult = {
  acknowledgedAt: string;
  handoffId: string;
  publicResponseAcknowledgedVersion: number;
};
```

The mutation must:

- require an authenticated `member` session;
- resolve tenant ID through `ensureTenantId`;
- scope by `tenantId`, session user ID as `memberId`, and `handoffId`;
- require `status IN ('open', 'accepted')`;
- require `publicResponse IS NOT NULL`;
- require current `publicResponseVersion === expectedPublicResponseVersion`;
- return a concurrency-style failure if the handoff is closed, belongs to another member or tenant,
  lacks a public response, or has a different current response version;
- return idempotent success when the same member already acknowledged the current version;
- write `publicResponseAcknowledgedAt`, `publicResponseAcknowledgedById`, and
  `publicResponseAcknowledgedVersion` for the current version;
- log one audit event, `support_handoff.public_response_acknowledged`, only for the first successful
  acknowledgement of a given current version.

### Read Contract

Extend the existing narrow member public-response read with acknowledgement state that is safe for
the member:

```ts
type MemberSupportHandoffPublicResponse = {
  publicResponse: string | null;
  publicResponseAt: string | null;
  publicResponseVersion: number;
  publicResponseAcknowledgedAt: string | null;
  publicResponseAcknowledgedVersion: number | null;
  publicResponseAcknowledged: boolean;
};
```

Extend the staff detail public-response sub-object, not the base `SupportHandoffDetailFields`, with
staff-readable acknowledgement status:

```ts
type StaffPublicResponseFields = {
  publicResponse: string | null;
  publicResponseAt: string | null;
  publicResponseVersion: number;
  publicResponseAcknowledgedAt: string | null;
  publicResponseAcknowledgedVersion: number | null;
  publicResponseAcknowledged: boolean;
};
```

Do not expose staff IDs, staff names, close reasons, reassign reasons, internal notes, notification
read state, or other members' data through the member contract.

### Server Action And Revalidation

Add a member action/core boundary for acknowledgement under
`apps/web/src/actions/support-handoffs/`. The server action should submit `handoffId` and
`expectedPublicResponseVersion`, pass the current member session to the domain function, and
revalidate localized `/member/help` plus `/staff/support-handoffs` after a successful new
acknowledgement.

Acknowledgement failure should return a form/action error. It must not mutate notification rows,
create notifications, close the handoff, or fail open across ownership boundaries.

### UI Contract

Member `/member/help`:

- Keep the existing public response banner placement above the advisory and form.
- Add the acknowledgement action inside the banner only when there is a public response and the
  current response version is not acknowledged.
- Show acknowledged timestamp text when the current version is acknowledged.
- Keep the action copy neutral, such as `Acknowledge update`; do not imply case resolution,
  agreement, SLA satisfaction, or that no further help is needed.
- Disable the action while pending and prevent duplicate submission.

Staff `/staff/support-handoffs`:

- Show acknowledgement status in the existing detail panel's public-response section.
- Use read-only status text for both assigned staff and branch managers.
- Do not add new staff filters, queue counters, route changes, or staff mutation controls in CRM08.

### Data, Auth, Tenancy, Routing, And Proxy Impact

- Data: a bounded nullable support-handoff schema extension is approved for the acknowledgement
  fields listed above.
- Auth: no auth-layer change is approved. Acknowledgement is member-only; staff and branch managers
  can only read acknowledgement status through existing staff detail scoping.
- Tenancy: every read and mutation must be tenant-scoped and member-scoped before exposing or
  writing acknowledgement state.
- Routing: canonical routes remain unchanged. The entry point remains `/member/help`; staff
  visibility remains `/staff/support-handoffs`.
- Proxy: `apps/web/src/proxy.ts` remains untouched.
- Stripe: unused.

### Edge Cases To Handle

- Member double-clicks acknowledgement: one write and one audit event, then idempotent success.
- Staff updates the public response after acknowledgement: current version becomes unacknowledged
  until the member acknowledges again.
- Member tries to acknowledge a stale response version: concurrency-style failure and no audit event.
- Handoff is closed before acknowledgement: failure and no new acknowledgement.
- Wrong member, wrong tenant, staff, branch manager, or unauthenticated user attempts the mutation:
  unauthorized or concurrency-style failure without leaking handoff existence.
- Missing public response: no acknowledgement action and mutation failure.
- Notification marked read without acknowledgement: staff detail still shows current response
  unacknowledged.
- Member acknowledges via `/member/help?handoffId=...`: scope remains member plus tenant plus
  handoff; no fallback to another member's handoff.
- Mobile and keyboard: acknowledgement button remains reachable, has visible focus, and does not
  shift the banner layout.

### Observability And Error Handling

- Log audit action `support_handoff.public_response_acknowledged` for first acknowledgement of the
  current response version.
- Do not log raw public response text in audit metadata.
- UI mutation failures should show existing action/form error patterns and leave the banner
  unchanged.
- No new queue, worker, email, push, or notification failure mode is introduced by CRM08.

### Rollback Or Mitigation

The schema extension is nullable and additive. If the UI must be rolled back, existing public
responses and CRM07 notifications continue to work; acknowledgement fields can remain unused until a
follow-up removes or revises them. No backfill is required.

### Likely Files Touched After Approval

- `packages/database/src/schema/crm.ts`
- `packages/database/drizzle/*`
- `packages/domain-claims/src/support-handoffs/acknowledgement.ts`
- `packages/domain-claims/src/support-handoffs/acknowledgement.test.ts`
- `packages/domain-claims/src/support-handoffs/response.ts`
- `packages/domain-claims/src/support-handoffs/queue.ts`
- `packages/domain-claims/src/support-handoffs/types.ts`
- `packages/domain-claims/src/support-handoffs/index.ts`
- `apps/web/src/actions/support-handoffs/acknowledgement.core.ts`
- `apps/web/src/actions/support-handoffs/acknowledgement.ts`
- `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_public-response-banner.test.tsx`
- `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx`
- `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.test.tsx`
- `apps/web/src/messages/*/help.json`
- `apps/web/src/messages/*/agent-claims.json`
- `apps/web/e2e/gate/staff-support-handoffs.spec.ts`

The exact file set may be smaller if existing action and component tests can cover the behavior
without broad rewrites.

### Non-Goals

- Treating notification-center `isRead` as acknowledgement.
- Passive read receipts or automatic acknowledgement on page view.
- Member reply forms, conversation threads, attachments, or staff follow-up messages.
- Email or push delivery.
- Staff acknowledgement notifications.
- Support-handoff-specific unread counters, queue filters, SLA timers, or auto-close behavior.
- New member or staff routes.
- Changing support-handoff public response write semantics.
- Changing CRM05 duplicate active-handoff advisory behavior.
- Changing support-handoff creation, source normalization, selected-claim validation, staff
  lifecycle semantics, branch-manager authority, proxy behavior, canonical routes, auth layering,
  tenancy architecture, Stripe posture, Relationship projection, Matter semantics, stored
  TrustSignal posture, README, AGENTS, or architecture docs.

### Acceptance Criteria

- A member can acknowledge the current public response version from `/member/help`.
- Staff and branch managers can see whether the current public response version is acknowledged in
  the existing staff support-handoff detail panel.
- A stale response version cannot be acknowledged as current.
- A staff response update makes the current version unacknowledged until the member acknowledges the
  new version.
- Duplicate member acknowledgement of the same version is idempotent and does not duplicate audit
  events.
- Closed handoffs, missing responses, unauthenticated sessions, non-member sessions, wrong-member
  sessions, and cross-tenant attempts do not create acknowledgement state.
- Notification `isRead` remains generic notification-center state and is not used as
  acknowledgement.
- No proxy, canonical route, auth-layer, tenancy-architecture, Stripe, email, push, member-reply,
  SLA, queue-counter, README, AGENTS, or architecture-doc changes are made.

### Verification Standard For P32-CRM08

The later implementation must include:

- Focused domain acknowledgement tests for authorization, tenant/member scoping, active status,
  current-version CAS, idempotent duplicate acknowledgement, stale-version failure, missing-response
  failure, closed-handoff failure, and audit metadata.
- Focused member public-response read tests proving acknowledgement fields are member-safe and
  current-version derived.
- Focused staff detail read tests proving staff and branch-manager acknowledgement visibility
  without member contract leakage.
- Server action tests for success, duplicate submit, stale submit, and revalidation.
- Member banner component tests for unacknowledged, pending, acknowledged, missing-response, and
  no-staff-identity states.
- Staff detail component tests for acknowledged and awaiting-acknowledgement display, including
  branch-manager read-only behavior.
- E2E gate proof that staff sends a public response, member acknowledges it from `/member/help`,
  staff sees acknowledged status, staff updates the response, staff sees awaiting acknowledgement,
  member acknowledges the new version, and close prevents further member acknowledgement display.
- `pnpm verify-slice -- --static`, the mandatory implementation reviewer pool, and
  `pnpm verify-slice -- --required-gates`.

## P32-DG12 Verification Proof

Local verification is completed on branch `codex/p32-dg12-response-ack-design` on 2026-05-05.

| Command                         | Result |
| ------------------------------- | ------ |
| `git diff --check`              | Pass.  |
| `pnpm plan:status`              | Pass.  |
| `pnpm plan:audit`               | Pass.  |
| `pnpm track:audit`              | Pass.  |
| `pnpm docs:verify`              | Pass.  |
| `pnpm verify-slice -- --static` | Pass.  |

Static verifier evidence:
`run_root=/private/tmp/interdomestik-p32-dg12/tmp/multi-agent/verify-slice/verify-slice-20260505T084826Z-e208d7`;
`selected_reviewers=security_reviewer architect_reviewer qa_reviewer`.

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
