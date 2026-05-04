# P32-DG10 Support Handoff Public Response Notification Design Review

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG10`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: lock the implementation design for member notification and awareness semantics after
  `P32-CRM06` public responses.

## Scope Boundary

This is a design-review and implementation-scope approval slice only. It does not authorize
product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`,
canonical route renames, auth layering changes, tenancy architecture changes, database schema
changes, Stripe reintroduction, email delivery, push delivery, support-handoff-specific unread
counters, read receipts, acknowledgements, SLA timers, member replies, conversation threads, broad
CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, PR
workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                     | Finding                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-04-p32-dg09-post-crm06-next-slice-selection.md`          | DG09 promoted this design review because CRM06 made staff public responses visible on `/member/help`, but deliberately left member notification and awareness semantics unresolved.                                                    |
| PR `#638`, merge commit `0183b354f0ab25c639888c7eab3da95b6ed0eb0b`           | CRM06 shipped one support-handoff-specific latest public response with assigned-staff-only writes, branch-manager read-only behavior, member-safe reads, a response version, and a latest-response index.                              |
| `packages/domain-claims/src/support-handoffs/response.ts`                    | Public response writes are already guarded by tenant, branch, assigned-staff, accepted-status, and `publicResponseVersion` compare-and-set semantics. This version can be the later notification idempotency boundary.                 |
| `packages/domain-claims/src/support-handoffs/types.ts`                       | The current member-safe public response type exposes only `publicResponse` and `publicResponseAt`; staff IDs, staff names, lifecycle reasons, assignment state, and other operational fields remain excluded from member reads.        |
| `packages/domain-communications/src/notifications/notify.ts`                 | The repo already has tenant-scoped in-app notification persistence, verified email guards, and push helpers. Email and push carry additional delivery, preference, template, and verified-recipient complexity.                        |
| `packages/database/src/schema/notifications.ts`                              | The existing `notifications` table already stores tenant, user, type, title, content, `actionUrl`, `isRead`, and `createdAt`. A first in-app notification does not need a support-handoff schema or notification-log schema extension. |
| `packages/domain-communications/src/notifications/get.ts` and `mark-read.ts` | Existing notification reads and mark-read mutations are tenant and user scoped. Generic notification-center read state exists, but it is not a support-handoff read receipt or acknowledgement.                                        |
| `apps/web/src/components/notifications/notification-center.tsx`              | The member shell already has an in-app notification center with unread display and mark-read behavior. A later implementation can use that surface without adding a new route.                                                         |
| `apps/web/src/actions/support-handoffs/response.core.ts`                     | Public response writes currently revalidate staff support handoffs and member help after success. A later implementation can dispatch a fire-and-forget notification after the successful write path, then keep these revalidations.   |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                           | Existing CRM06 E2E proof already covers staff response visibility to the member. CRM07 should extend that proof to notification-center awareness without changing the base public-response flow.                                       |

## Gate Decisions

1. The next implementation slice must be a bounded in-app notification for support-handoff public
   responses. It must not start with email or push delivery.
2. The implementation may add a new notification event type such as
   `support_handoff_public_response`, but it must reuse the existing `notifications` table and
   notification center.
3. The implementation must not add a new support-handoff notification table, notification queue,
   outbox, delivery-log table, schema column, or index unless a later gate explicitly authorizes it.
4. A notification should be created only after a successful public response write or update on an
   accepted support handoff. Failed compare-and-set writes, unauthorized writes, branch-manager
   read-only access, and validation failures must not create notifications.
5. Each successful `publicResponseVersion` update is the idempotency boundary. A browser retry using
   the same expected version should fail the public-response write and therefore must not duplicate
   the notification.
6. The recipient must be the handoff's member, resolved from the tenant-scoped handoff row. The
   implementation must not accept member ID, tenant ID, claim ID, or notification payload values
   directly from the browser.
7. The notification content may include only member-safe fields: a generic title, bounded subject or
   fallback support-request label, response timestamp, optional linked-claim label/status when
   already member-safe, and an action URL to the existing localized `/member/help` surface.
8. The notification payload and UI must not expose staff IDs, staff names, assignment state, branch
   manager state, close reasons, reassign reasons, internal notes, full lifecycle timeline metadata,
   other members' handoffs, or raw public response text beyond the existing member help banner.
9. Generic notification-center `isRead` may be used to show whether the notification item has been
   read in the existing notifications UI. That must not be described or tested as a
   support-handoff-specific read receipt, acknowledgement, SLA state, or member-response state.
10. Member support submission, CRM05 advisory behavior, the CRM06 public response banner, staff
    accept/reassign/close lifecycle actions, branch-manager read-only behavior, and existing
    canonical routes must remain unchanged.
11. Email delivery, push delivery, support-handoff-specific unread counters, read receipts,
    acknowledgements, SLA timers, member replies, and conversation threads remain deferred.

## Approved P32-CRM07 Implementation Design

### Slice Goal

Notify members inside the existing notification center when staff send or update a member-visible
support-handoff public response, without changing the support-handoff response model or adding a new
delivery channel.

### Product-Facing Behavior

- Assigned staff can keep using the existing public response form on `/staff/support-handoffs`.
- After a successful public response write or update, the member receives one in-app notification in
  the existing notification center.
- The notification links to the existing `/member/help` surface where the member can read the latest
  member-safe public response banner.
- Members can mark the notification read through the generic notification center.
- Members can still submit another support request, and CRM05 advisory behavior remains
  non-blocking.
- Branch managers remain read-only and cannot trigger notifications by viewing support handoffs.

### Event And Idempotency Contract

The later implementation should add a focused notification helper, preferably under the existing
domain-communications notification boundary, with a name like
`notifySupportHandoffPublicResponse`.

Suggested input shape:

```ts
type SupportHandoffPublicResponseNotification = {
  tenantId: string;
  memberId: string;
  handoffId: string;
  publicResponseVersion: number;
  subject: string;
  linkedClaimLabel?: string | null;
  linkedClaimStatus?: string | null;
  locale?: string | null;
};
```

The public-response write path should derive this delivery context from the tenant-scoped updated
handoff row after the compare-and-set succeeds. The browser must not submit delivery context.

The implementation should create the in-app notification in a fire-and-forget path after the
successful response write, consistent with existing notification dispatch patterns. Notification
failure must be logged and must not roll back the public response write.

### Channel Contract

- Approved first channel: in-app notification only.
- Deferred channels: email and push.
- Approved destination: existing notification center.
- Approved action URL: localized `/member/help`, optionally with a narrow query parameter if the
  implementation can prove it does not alter canonical route semantics.
- No new page, route, queue worker, outbox table, or notification preference surface is approved.

### Data, Auth, Tenancy, Routing, And Proxy Impact

- Data: no schema change is approved for CRM07. The implementation must reuse
  `support_handoffs.public_response_version` and the existing `notifications` table.
- Auth: no auth-layer change is approved. The write remains assigned-staff-only through the
  existing public-response action/core boundary.
- Tenancy: the notification recipient must be resolved through tenant-scoped handoff/user data and
  persisted with the same tenant ID.
- Routing: canonical routes remain unchanged. The member notification points to `/member/help`.
- Proxy: `apps/web/src/proxy.ts` remains untouched.
- Stripe: unused.

### Copy And Locale Contract

The implementation should add localized notification title/content for all supported notification
message bundles or the narrow locale surface it touches. Copy must avoid operational promises:

- Do say that staff posted an update to the member's support request.
- Do point the member to `/member/help` for the full response.
- Do not promise response times, SLA completion, acknowledgement, case resolution, or two-way chat.
- Do not include staff-only lifecycle reasons or internal operational details.

### Likely Files Touched After Approval

- `packages/domain-communications/src/notifications/notify.ts`
- `packages/domain-communications/src/notifications/notify.test.ts`
- `apps/web/src/lib/notifications.core.ts` or `apps/web/src/lib/notifications.ts`
- `packages/domain-claims/src/support-handoffs/response.ts`
- `packages/domain-claims/src/support-handoffs/response.test.ts`
- `packages/domain-claims/src/support-handoffs/types.ts`
- `apps/web/src/actions/support-handoffs/response.core.ts`
- `apps/web/src/actions/support-handoffs/response.core.test.ts`
- `apps/web/src/components/notifications/notification-center.tsx`
- `apps/web/src/components/notifications/notification-center.test.tsx`
- `apps/web/src/messages/*/notifications.json`
- `apps/web/e2e/gate/staff-support-handoffs.spec.ts`

The exact file set may be smaller if the implementation can reuse existing notification-center
rendering without UI changes.

### Non-Goals

- Email delivery.
- Push delivery.
- Support-handoff-specific unread counters.
- Read receipts.
- Acknowledgements.
- SLA timers or response-time commitments.
- Member replies.
- Two-way support-handoff conversation threads.
- New support-handoff detail routes.
- New notification queue, outbox, delivery log, table, column, or index.
- Exposing public response text directly in the notification center if it would duplicate or widen
  the member-safe `/member/help` response banner.
- Changing support-handoff creation, selected-claim validation, source normalization, advisory
  reads, staff lifecycle semantics, branch-manager authority, proxy behavior, canonical routes,
  auth layering, tenancy architecture, schema, Stripe posture, Relationship projection, Matter
  semantics, stored TrustSignal posture, README, AGENTS, or architecture docs.

### Acceptance Criteria

- A successful assigned-staff public response write creates one tenant-scoped in-app notification
  for the handoff's member.
- Updating the public response after a new successful `publicResponseVersion` creates a new
  notification for that new version.
- Retrying a stale expected version, writing as an unassigned staff user, writing as a branch
  manager, writing across tenant or branch boundaries, or submitting invalid response text does not
  create a notification.
- The notification links to the existing `/member/help` surface and the member can still see the
  CRM06 public response banner there.
- The notification center does not expose staff-only close/reassign reasons, internal notes,
  assignment state, staff identity, or other members' handoffs.
- Existing generic notification mark-read behavior remains generic notification-center state and is
  not treated as a support-handoff read receipt or acknowledgement.
- No product runtime behavior outside the approved support-handoff public-response notification path
  changes.

### Verification Standard For P32-CRM07

The later implementation must include:

- Focused domain notification tests for event type, tenant scoping, member recipient resolution,
  safe payload fields, and in-app persistence.
- Focused support-handoff public-response tests proving notification dispatch only follows a
  successful compare-and-set write.
- Focused web action tests proving notification dispatch failure is logged and does not fail the
  public response write.
- Notification-center component coverage if the event needs a custom icon, label, or localized
  rendering.
- E2E gate proof that staff public response creation produces a member notification, the member can
  open `/member/help` from the notification path, and duplicate/stale write attempts do not create
  duplicate notification evidence.
- `pnpm verify-slice -- --static`, the mandatory implementation reviewer pool, and
  `pnpm verify-slice -- --required-gates`.

## P32-DG10 Verification Proof

Local verification is completed on branch `codex/p32-dg10-public-response-notification-design` on
2026-05-04.

| Command                         | Result                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`              | Pass.                                                                                                                                                              |
| `pnpm plan:status`              | Pass.                                                                                                                                                              |
| `pnpm plan:audit`               | Pass.                                                                                                                                                              |
| `pnpm track:audit`              | Pass.                                                                                                                                                              |
| `pnpm docs:verify`              | Pass.                                                                                                                                                              |
| `pnpm verify-slice -- --static` | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T183033Z-061598`; selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
