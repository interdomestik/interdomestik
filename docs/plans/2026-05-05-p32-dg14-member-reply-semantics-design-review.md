# P32-DG14 Member Support Handoff Reply Semantics Design Review

## Metadata

- Date: 2026-05-05
- Slice: `P32-DG14`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: Decide whether the V3 pilot support-handoff model needs member-authored replies after
  staff public responses and acknowledgements, and define the smallest safe implementation contract.

## Scope Boundary

This is a design-review gate only. It does not authorize product-code changes, schema migrations,
new routes, proxy changes, auth or tenancy refactors, Stripe reintroduction, README, AGENTS, or
architecture-doc changes. No `packages/`, `apps/`, `supabase/`, or source files are modified.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                    | Finding                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-05-p32-dg12-response-acknowledgement-design-review.md`                  | DG12 approved acknowledgement and explicitly deferred member replies, conversation threads, SLA timers, queue counters, and staff acknowledgement notifications.  |
| `docs/plans/2026-05-05-p32-dg13-post-crm08-next-slice-selection.md`                         | DG13 ranked member reply semantics design above direct reply implementation and promoted this gate.                                                               |
| `packages/domain-claims/src/support-handoffs/types.ts`                                      | Current model uses `open`, `accepted`, and `closed`; public response writes use `public_response_version`; acknowledgement binds to the expected current version. |
| `packages/domain-claims/src/support-handoffs/acknowledgement.ts`                            | Existing CAS pattern derives tenant and member from session, scopes by tenant/member, treats closed handoffs as immutable, and audits structural metadata.        |
| `packages/database/src/schema/crm.ts`                                                       | Existing support-handoff timestamps use Drizzle `timestamp(...)`, and public responses already have a database length check.                                      |
| `apps/web/src/app/[locale]/(app)/member/help/_public-response-acknowledgement-form.tsx`     | CRM08 adds acknowledgement but intentionally has no reply form, attachments, or conversation timeline.                                                            |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx` | Staff already reads acknowledgement status in the existing detail panel with no new mutation surface.                                                             |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                          | Gate covers staff response, member notification, acknowledgement, staff visibility, updated-response awaiting state, and close-path behavior.                     |

## Design Decisions

### 1. Member Replies Belong In V3

Decision: yes, as a single optional follow-up per staff-response cycle.

Acknowledgement confirms the member read a response, but it does not let the member say whether the
answer resolved the issue or whether clarification is needed. Without a reply path, the member must
file a new support handoff, which loses context and increases staff queue load. A bounded follow-up
is a real pilot operational need.

### 2. Scalar Shape, Not A Thread

Decision: store one latest member follow-up per response cycle as nullable scalar fields on
`support_handoffs`:

- `member_reply text | null`
- `member_reply_at timestamp | null`
- `member_reply_response_version integer | null`

No new table is authorized by CRM09. The reply is tied to the `public_response_version` it answers,
mirroring the acknowledgement CAS pattern.

The Drizzle schema must align with existing `support_handoffs` timestamp columns:
`memberReplyAt: timestamp('member_reply_at')`. CRM09 must not introduce a `timestamptz` column into
this table unless a later schema-consistency gate changes the timestamp convention for the table.

When staff authors a new public response, any existing scalar reply is no longer current. CRM09
displays only a reply whose `member_reply_response_version` equals the current
`public_response_version`. If the member later replies to the newer response cycle, that write
overwrites the scalar fields. Earlier-cycle replies are not retained as durable history in this
scalar design. Full reply history, collapsed history UI, or conversation threading requires a later
table-backed design gate and is deferred.

### 3. Active Statuses Only

Decision: replies are permitted only on `open` or `accepted` handoffs when
`public_response_version > 0`.

Acknowledgement of the current response is also required:
`publicResponseAcknowledged === true` and
`publicResponseAcknowledgedVersion === publicResponseVersion`. A member cannot reply before reading
the current response. `closed` handoffs remain fully immutable, aligned with the existing
`ACTIVE_HANDOFF_STATUSES` guard. One reply is allowed per response cycle; a same-cycle repeat returns
`ALREADY_REPLIED`.

### 4. Staff Visibility

Decision: show the reply read-only in the existing `/staff/support-handoffs` detail panel only.

No queue badge, unread counter, queue filter, or new staff route is authorized for V3. Those are
product-queue decisions that should follow a working implementation.

If the detail panel's current public-response cycle has a member reply
(`memberReplyResponseVersion === publicResponseVersion`), the staff public-response form should show
a lightweight warning near the send/update button before staff authors the next response. The
warning is not a blocker and is not a notification; it only reduces the risk that staff miss a
current-cycle reply before incrementing `public_response_version`, which would make the scalar reply
non-current.

### 5. Branch-Manager Access

Decision: branch managers retain existing read-only access. They see the reply in the same detail
panel they already use for acknowledgement status, with no mutation or notification.

### 6. Tenant And Member Boundaries

Decision: follow the acknowledgement CAS pattern exactly.

`tenantId` is derived from the authenticated session via `ensureTenantId(session)`. `memberId` is
derived from `session.user.id`, and the domain function asserts that the authenticated member owns
the handoff. Tenant isolation is enforced by `withTenant(tenantId, supportHandoffs.tenantId, ...)`
on row reads and updates. Existing branch-scoped staff queue/detail reads continue to enforce
branch-manager visibility. No new cross-branch surface is added.

### 7. Notifications And Counters Deferred

Decision: no staff notification on reply, no member notification, no unread counter, and no
acknowledgement reset.

CRM07 notification-center state remains about staff public responses. CRM08 acknowledgement remains
about member awareness of staff responses. A member reply does not reset acknowledgement. Staff reply
notifications are a future candidate, tentatively `P32-DG15 Member Reply Staff Notification Design
Review`, not part of this gate.

### 8. Audit Metadata

Decision: audit event `support_handoff_member_reply_submitted` stores structural metadata only:

- `handoffId`
- `tenantId`
- `memberId`
- `replyResponseVersion`
- `replyAt`

Raw reply text is not stored in audit logs. It lives only in `support_handoffs.member_reply`, subject
to normal tenant data retention and future right-to-erasure handling on the handoff record.

### 9. CRM09 Proof Contract

The promoted implementation slice must satisfy this contract:

- Domain function: `submitSupportHandoffMemberReplyCore(params, deps)`.
- Guard order: session -> tenant/member row -> active status -> response exists ->
  acknowledgement exists for current version -> CAS -> same-cycle idempotency.
- Error codes: `CLOSED` | `NO_RESPONSE` | `NOT_ACKNOWLEDGED` | `ALREADY_REPLIED` |
  `STALE_VERSION` | `UNAUTHORIZED`.
- CAS/idempotency architecture: mirror `acknowledgement.ts` by using an `UPDATE ... returning` path
  with a fallback `SELECT` when no row updates. In that fallback, if
  `current.memberReplyResponseVersion === expectedPublicResponseVersion`, return `ALREADY_REPLIED`
  so double-submit and raced parallel submits classify as same-cycle idempotency instead of stale or
  unauthorized failure.
- Mutation: one `UPDATE` setting `member_reply`, `member_reply_at`, and
  `member_reply_response_version`; no `public_response_version` or `lifecycle_version` change.
- Schema: add Drizzle fields `memberReply`, `memberReplyAt`, and `memberReplyResponseVersion`.
  `memberReplyAt` must use the existing table convention, `timestamp('member_reply_at')`. Add a
  database check parallel to `support_handoffs_public_response_length_check`:
  `support_handoffs_member_reply_length_check`, enforcing
  `member_reply is null or char_length(member_reply) <= 1000`.
- Type contract: expose a `MemberReplyFields` shape or equivalent fields on
  `SupportHandoffStaffDetail`, with `memberReply`, `memberReplyAt`, and
  `memberReplyResponseVersion`, so the staff detail panel receives the read model explicitly.
- Server action validation: use explicit Zod validation with `MAX_MEMBER_REPLY_LENGTH = 1_000`,
  trimming input but rejecting overlong text instead of silently truncating it. The member UI should
  surface the validation error rather than sending severed text.
- Member form visible only when active, a public response exists, the current version is
  acknowledged, and no same-cycle reply exists.
- Staff detail panel shows a read-only `memberReply` section only when a reply exists for the
  current cycle.
- Staff public-response form shows a non-blocking warning near the send/update button when a
  current-cycle member reply exists and staff are about to author the next response.
- Required test markers: `member-reply-form`, `member-reply-success`, and `handoff-member-reply`.
- E2E gate scenario: staff response -> member notification -> acknowledgement -> reply -> staff
  sees the reply -> same-cycle reply form absent.
- Unit tests cover happy path plus `CLOSED`, `NO_RESPONSE`, `NOT_ACKNOWLEDGED`, `STALE_VERSION`,
  `ALREADY_REPLIED`, `UNAUTHORIZED`, overlong validation rejection, and update-fallback
  idempotency.
- Full i18n for the currently supported member-help and staff support-handoff locales: `en`, `mk`,
  `sq`, and `sr`, under a `memberReply` namespace.

## Gate Decision

Promote exactly one next bounded implementation slice:

**`P32-CRM09 Member Support Handoff Reply`**

CRM09 must implement one scalar member reply per response cycle after current-response
acknowledgement. Earlier-cycle replies are not retained as durable history; a later reply for a
newer response cycle overwrites the scalar reply fields. CRM09 must align the new timestamp and
length constraints with the existing Drizzle schema, reject overlong replies explicitly instead of
silently truncating them, expose the reply fields in the staff detail read type, and show a
non-blocking warning before staff overwrite a response cycle that currently has a member reply.
CRM09 must not implement conversation threads, historical reply tables, attachments, staff
notifications, unread counters, SLA timers, queue badges, new routes, proxy changes, auth or tenancy
refactors, Stripe, Relationship, Matter, TrustSignal, README, AGENTS, or architecture docs.

## P32-DG14 Verification Proof

Local verification is completed on branch `codex/p32-dg14-member-reply-design` on 2026-05-05.

| Command                         | Result |
| ------------------------------- | ------ |
| `git diff --check`              | Pass.  |
| `pnpm plan:status`              | Pass.  |
| `pnpm plan:audit`               | Pass.  |
| `pnpm track:audit`              | Pass.  |
| `pnpm docs:verify`              | Pass.  |
| `pnpm verify-slice -- --static` | Pass.  |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
