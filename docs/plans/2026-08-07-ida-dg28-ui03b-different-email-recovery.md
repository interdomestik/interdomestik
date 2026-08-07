# IDA-DG28 — Different-email recovery design gate

Status: proposed current-authority/design gate

Sole prospective implementation slice: `IDA-UI03b`

Classification: Tier 3 protected auth/ownership/privacy workflow

Base SHA: `919d10f269e0a498114b5eeacdda140388f59bbd`

Runtime authorized: false

Deployment/production/provider/database-real-data authorized: false

## Decision and user outcome

`IDA-UI03b` is the bounded recovery flow for a person who saved a vehicle or
property Free Start draft under one verified email and later needs to continue
with a different email. The flow is fail-closed and requires two independent
email proofs before any draft is returned or any identity state changes:

1. verify the original email that is the current canonical identity for the
   draft owner;
2. verify the replacement email; and
3. explicitly confirm the recovery after both proofs succeed.

The existing `user.id` remains the entity of record. `free_start_drafts.owner_user_id`
is never rewritten, a second account is never created, and membership, tenant,
subscription, claim, payment and entitlement state remain unchanged. The only
allowed identity mutation is a canonical email replacement on that same user,
performed through the existing Better Auth boundary after the dual proof and
collision check. A replacement email already belonging to another user fails
closed with generic copy and no draft disclosure.

No draft facts, count, category, resume step, timestamps, owner existence or
tenant existence may be disclosed before the final confirmation. Failed,
expired, mismatched, replayed, over-attempted or cross-tenant challenges have
the same content-free result as an unknown recovery request.

## Authority model

The repository is final authority. The current tracker has no promoted
`IDA-UI03b` row; this gate is the fresh current-authority proposal requested
after the exact scope sentence was approved. It must be merged and then
re-resolved before a runtime receipt or implementation branch is considered
authorized. The stale Brain packet observed before drafting is advisory only
and contributed no scope or authority.

The canonical owner remains the existing `user.id` referenced by
`free_start_drafts.owner_user_id`. The flow must not infer ownership from a
new email, a browser identifier, draft facts, a claim number, a tenant code,
or a caller-supplied user id. The original proof resolves the owner through
the existing Better Auth email-OTP authority; the replacement proof proves
control of the proposed address but does not create or select another account.

## Exact state machine

The recovery challenge is an opaque, short-lived server state with two
purpose-bound verification legs: `original_email` and `replacement_email`.
Only hashed OTP values and structural metadata may be retained in the existing
Better Auth verification representation. Raw OTPs, raw email addresses, draft
facts and user-existence distinctions must never enter logs, URLs, analytics,
audit metadata or browser storage.

The server sequence is:

1. receive normalized original/replacement addresses and a locale-safe return
   intent; do not accept a draft id or user id from the browser;
2. issue the two challenge legs with the existing five-minute/three-attempt
   OTP limits and generic send responses;
3. verify the original leg and resolve exactly one same-tenant member owner,
   without returning a draft or creating a session visible to the browser;
4. verify the replacement leg, reject an address owned by a different user,
   and require the original and replacement addresses to be distinct after
   canonical normalization;
5. require explicit final confirmation bound to the opaque challenge and its
   version; lock the user row and re-check email uniqueness and challenge
   freshness in one transaction;
6. update only the existing user's canonical email and verified flag through
   the Better Auth adapter, append a content-free structural audit event, and
   mint the normal same-user recovery session; and
7. only after commit, load the existing owner-scoped draft manager. A failed
   transaction leaves the user, draft, sessions, membership and audit state
   unchanged.

The implementation must prove that normal email-OTP sign-in cannot be used as
the replacement leg, because that path may create a new account. It must use a
purpose-bound recovery operation in the existing auth boundary and must not
call a public `sign-up`, account-link, social-provider, password-reset or
claim-creation endpoint.

## Primary user and business value

Primary user: a pre-membership Free Start customer who changed or lost access
to the email used for a saved draft but can still prove control of both
addresses.

Business value: recover legitimate saved progress without forcing duplicate
draft entry, while preventing account takeover, cross-tenant disclosure and
accidental account merging. The measurable user outcome is a successful
same-owner recovery with zero repeated draft facts and zero duplicate user
records.

Entry point: existing saved-draft manager on the Free Start surface, adjacent
to the existing same-email secure-save/recovery path.

Exit state: the same user id is signed in with the replacement email, the
existing owner-scoped drafts are available through the unchanged manager, and
no claim or membership state has changed.

## Exact writer map

Only these paths may change. Any additional path stops the slice and returns to
authority.

Production/config writers:

1. `apps/web/src/lib/auth/different-email-recovery.ts` (new, purpose-bound
   challenge/verification core; no direct provider or raw SQL escape hatch)
2. `apps/web/src/lib/auth/index.ts` (wire the existing Better Auth boundary)
3. `apps/web/src/actions/free-start-drafts/lifecycle.core.ts`
   (server authorization and same-owner orchestration)
4. `apps/web/src/actions/free-start-drafts.ts` (thin action export only)
5. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/saved-draft-list.tsx`
   (one explicit recovery entry and inline non-disclosing confirmation UI)
6. `apps/web/src/messages/sq/freeStart.json`
7. `apps/web/src/messages/en/freeStart.json`
8. `apps/web/src/messages/sr/freeStart.json`
9. `apps/web/src/messages/mk/freeStart.json`

Focused proof writers:

10. `apps/web/src/lib/auth/better-auth-email-otp.contract.test.ts`
11. `apps/web/src/actions/free-start-drafts.boundary.test.ts`
12. `apps/web/e2e/gate/premium-free-start-result.spec.ts`

No new component, route, test file or size-budget entry is admitted in the
design gate. Existing focused component/action collectors are extended in the
three proof writers above; a new file or a fourth proof writer stops the slice.

The map intentionally excludes database schema/migrations: the existing
`user.email` unique field, `user.id` owner key, `free_start_drafts` RLS policy,
Better Auth verification storage and audit log are reused. If those contracts
cannot safely support the dual-proof transaction, implementation stops and a
new protected prerequisite gate is required; no schema is improvised inside
this slice.

## Forbidden surfaces and non-goals

- `apps/web/src/proxy.ts`, canonical routes, host classification and clarity
  markers;
- Better Auth provider replacement, public sign-up, social linking, password
  reset, account merge, account deletion or broad auth/session architecture;
- changing `user.id`, `tenant_id`, `branch_id`, role, member number, subscription,
  entitlement or membership lifecycle;
- rewriting `free_start_drafts.owner_user_id`, copying or exposing draft facts,
  draft counts, claim numbers or claim state;
- new tables, columns, migrations, RLS policies, database grants or direct
  provider/database connections;
- draft-to-claim conversion, claim submission, payment, Paddle, documents,
  uploads, analytics, notifications, staff/agent/admin views or support
  recovery;
- anonymous browser recovery, device fingerprinting, cookies, localStorage,
  URL tokens, long-lived recovery links or cross-device access without both
  email proofs;
- new dependencies, CI/CD, deployment, production, runner, README, AGENTS,
  architecture docs or tracker maintenance in the implementation PR.

`IDA-UI03a2` remains a separate blocked/frozen draft-to-claim sequence. Hero
redesign and membership-dashboard polish remain separate future phases.

## Highest-risk cases

1. The replacement OTP path accidentally creates a second user.
2. A new email already belongs to another user and the flow leaks that fact.
3. The original proof resolves a user outside the draft's home/access tenant.
4. A stale, replayed or cross-tab challenge changes email after expiry or after
   a prior successful confirmation.
5. Draft facts or owner existence appears before both proofs and final commit.
6. The same user id, owner key, tenant, membership or subscriptions change in
   an unexpected way.
7. Concurrent email changes race and bypass the unique email constraint.
8. OTPs, email addresses, challenge ids or draft content enter logs, URLs,
   analytics, errors or audit metadata.
9. A provider timeout leaves email changed but the recovery session or audit
   event absent.
10. Locale, keyboard, reduced-motion or no-JavaScript behavior makes the
    existing manager unusable or falsely promises recovery.

## Acceptance evidence

Focused unit/contract proof must demonstrate:

- two exact OTP legs are required; one leg, wrong order, wrong purpose, expired
  or over-attempted codes never return a draft or mutate a user;
- same-owner email replacement preserves `user.id`, draft owner key, tenant,
  access tenant, membership/subscription rows and draft versions;
- an existing different user at the replacement address fails generically with
  zero writes and no existence oracle;
- final confirmation is idempotent and replay-safe; concurrent confirmations
  produce one email update, one audit event and one recovery session;
- all raw secrets and addresses are absent from logs, URLs, telemetry and audit
  metadata; the audit record contains only structural action/entity/version
  fields;
- owner RLS and existing draft read/update/delete semantics remain unchanged;
- normal same-email secure save, anonymous browser recovery, inactive manager
  mode and active-member entry remain unchanged.

Browser proof must cover SQ/EN/SR/MK, keyboard/focus, reduced motion, generic
failure copy, refresh/reload, duplicate submit, back navigation, no-JavaScript
fallback and a second browser context. The browser must not see draft facts
until the final successful response, and the successful response must show the
existing manager rather than a new dashboard or route.

Mandatory gates after implementation are the focused suite, `pnpm pr:verify`,
`pnpm security:guard`, `pnpm e2e:gate`, Sonar, CodeQL, gitleaks, pnpm audit,
reviewer/security feedback, finalizer and zero unresolved threads. Codex
Security diff scan is explicitly waived by user instruction; repo-native
security evidence remains mandatory. Full E2E is run once on the ready PR head.

## Rollback and mitigation

Rollback is the exact implementation-merge revert. Because the flow changes a
canonical email on the same user, rollback must not silently change it back or
delete drafts. The safe rollback sequence disables new different-email recovery,
keeps existing same-email sign-in and draft management available, preserves all
committed email/draft/audit rows, and requires a separately approved repair if
an already completed email replacement must be reversed.

Stop before mutation or merge if the Better Auth boundary cannot perform the
dual-proof same-user email update atomically, if a new schema or provider
primitive is required, if any writer outside the map is needed, if a draft or
owner fact is exposed before commit, if a second account is created, or if any
mandatory proof is missing on the exact current head.

## Reviewer and resource contract

This is Tier 3 because it changes a protected identity/ownership workflow even
though no new schema is planned. Use one bounded senior review on the exact
gate/current diff; Opus 5 is priority when available, with GPT-5.6 Sol Max as
the approved fallback. Do not resubmit a timed-out route. The reviewer is
advisory and cannot replace repository gates or Arben's exact-hash approval.

Mac is control plane/light writer only. No Docker on Mac. Z620 heavy proof is
not authorized by this docs-only gate and, if later required by the merged
runtime authority, must pass fresh disk/memory/runner/lease preflight through
the governed controller.

## Design-gate stop condition

This document is docs-only. It grants no runtime authority. Promotion requires
the passing admission receipt, UI/UX benchmark receipt, bounded review
disposition, current-head docs checks and Arben approval of these exact bytes
and SHA-256. After merge, a separate exact runtime receipt is required before
any product mutation.
