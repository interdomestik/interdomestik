# IDA-DG28 — Different-email recovery design gate

Status: proposed current-authority/design gate, R6 after bounded R5 disposition

Sole prospective implementation slice: `IDA-UI03b`

Classification: Tier 3 protected auth/ownership/privacy workflow

Base SHA: `919d10f269e0a498114b5eeacdda140388f59bbd`

Runtime authorized: false

Deployment/production/provider/database-real-data authorized: false

## Decision and user outcome

`IDA-UI03b` is the bounded recovery flow for a person who saved a vehicle or
property Free Start draft under one verified email, still controls that
mailbox, and needs to continue under a different email. Recovery completes only
after independent one-time proofs of the current canonical email and the
replacement email.

The existing `user.id` remains the entity of record. The flow never rewrites
`free_start_drafts.owner_user_id`, creates or selects another account, transfers
a draft, converts a draft to a claim, or changes tenant, role, membership,
subscription, payment or entitlement state. Its sole identity mutation is a
compare-and-swap update of `user.email` and `emailVerified` for the same user.

Recovery calls accept no draft id, draft facts, owner id, user id or tenant
selector and return no draft data. A collision with another user's email is
represented by the same generic client state as an unavailable recovery; no
timing-equivalence claim is made. Failed, expired, mismatched, replayed,
superseded or over-attempted proof remains fail-closed.

## Authority model and review reconciliation

Repository authority is final. Exact main has no promoted `IDA-UI03b`; this
docs-only gate and its bounded program/tracker records are a proposal until the
exact bytes and SHA-256 are approved and merged. Brain and Wiki contributed
advisory history only.

The canonical owner is the existing `user.id` referenced by
`free_start_drafts.owner_user_id`. Ownership is never inferred from a replacement
email, browser identifier, draft fact or caller-supplied identity. An uncached
authoritative Better Auth session selects the user; the current-mailbox OTP
proves control of the original address, and the replacement-mailbox OTP proves
control of the proposed address. An authoritative session is not represented
as Better Auth's separate age-based “fresh session” control.

R1 corrected the unsupported lost-mailbox interpretation and accepted that raw
normalized email material may exist only inside the bounded verification value.
R2 bound lock-resolved Better Auth 1.6.25, explicit provider failure states,
purpose copy, deterministic size metadata and the Z620 PostgreSQL proof lane.
R3 corrected omitted provider/harness writers and removed false claims about
session freshness, browser mutation proof and collision timing.

The GPT-5.6 Sol Max R3 review found that Better Auth's stock email-change
endpoints cannot satisfy this gate: delivery failure is swallowed before the
endpoint response, two replacement targets are atomic only per identifier, and
a confirm-time unique collision can reach Better Auth's raw error logger. R4
therefore does not enable or call the stock request/change-email endpoints.
Instead, one bounded server-action family owns both OTP challenges, awaits the
existing content-free mail primitive, serializes every transition per user with
the existing PostgreSQL advisory-lock pattern, and performs one old-email CAS
inside the same transaction that consumes the replacement proof. No custom auth
route/plugin, schema, migration or provider is introduced.

The GPT-5.6 Sol Max R4 review then found two bounded defects: current-mail
delivery preceded reservation/invalidation, and case-sensitive database
uniqueness could not prove canonical global collision containment. R5 mirrors
the disabled-reservation/send/exact-activation protocol on both stages and uses
a short confirm-time user-table lock plus global trimmed-lowercase comparison.
These corrections add no writer, schema, migration, route or provider.
The bounded same-session R5 disposition found one proof-text contradiction:
preflight rollback correctly preserves prior committed state, whereas failure
after a successful superseding commit must leave no active proof. R6 separates
those cases without changing the state machine or writer map.

## Exact state machine

The implementation uses the existing Better Auth session reader, `dbAdmin`,
`user`, and `verification` tables. OTPs are six random digits and are stored only
as an HMAC-SHA-256 digest plus stage metadata in `verification.value`. The HMAC
key is the existing required `OTP_RATE_LIMIT_HMAC_SECRET`, domain-separated with
an `IDA-UI03b` recovery prefix; missing or malformed secret is a generic 503.
Challenge identifiers contain the user id and stage, not an email.
Raw current/replacement addresses may exist only in the short-lived JSON value
of the replacement challenge, never in logs, URLs, analytics, cookies or browser
storage. Both stages expire after five minutes, allow three failed attempts and
rotate on resend.

Every mutation transaction first obtains
`pg_advisory_xact_lock(hashtextextended(user.id, <fixed-slice-namespace>))`.
The final confirmation additionally obtains the short-lived PostgreSQL
`SHARE ROW EXCLUSIVE` lock on `user` before its global canonical collision
recheck and CAS. That lock serializes the rare confirmation against every
concurrent user-table insert/update without changing another writer.
All recovery server actions validate the canonical neutral host, resolve an
uncached authoritative session, require the default access tenant, apply the
existing OTP IP/identity limiter and accept only their exact stage input.

The sequence is:

1. From the already-authorized owner-scoped saved-draft manager, start current
   proof with no caller identity. The action derives current email and user id
   only from the authoritative session. Under the user lock it invalidates both
   stages and creates one disabled nonce/versioned current reservation whose
   digest is bound to the canonical current email, then commits. It awaits
   purpose-specific current-email delivery through
   `sendEmail(..., {telemetryPolicy:'content-free'})`, re-locks, rechecks the
   database email and activates only that exact reservation. A preflight
   transaction failure sends nothing and leaves prior committed state
   unchanged. Delivery, drift or activation failure returns generic 503 and
   leaves no active usable challenge. Overlapping starts cannot activate a
   superseded nonce.
2. Submit only the current OTP and normalized replacement email. Under the same
   user lock, consume the current challenge once, require its session-bound
   current email still to equal the database email, invalidate every prior
   replacement challenge for that user and perform a global cross-tenant
   canonical collision check using trimmed, lowercased stored and target
   addresses.
3. For a non-colliding address, create a disabled replacement reservation,
   commit, await purpose-specific replacement-email delivery, then under the
   user lock activate only that exact reservation. Delivery or activation
   failure removes or leaves unusable only that exact reservation and returns
   generic 503. For an existing-email collision, send nothing, create no active
   challenge and return the same generic request-leg client state used for an
   unavailable recovery.
4. Submit only the replacement OTP. Under the same user lock, read the one
   active reservation, enforce expiry/attempts/digest, re-read the authoritative
   user, acquire the short-lived `SHARE ROW EXCLUSIVE` user-table lock, re-check
   global cross-tenant collision with trimmed lowercase equivalence, and execute
   `UPDATE user SET email = new, emailVerified = true WHERE id = sessionUser AND
email = old RETURNING id`.
   The transaction must return exactly the same user id, consume the reservation
   and leave no second usable challenge. A concurrent/superseded confirmation,
   old-email drift, target collision or zero-row CAS returns one generic failure.
5. Expire only the Better Auth session-data cache cookie, never the session-token
   cookie, then refresh the existing manager. Draft actions already re-read the
   uncached session and continue under the unchanged `user.id`/owner RLS key.

The transaction/provider modules catch errors without logging error objects,
addresses, OTPs or challenge values; optional observability is limited to fixed
content-free categories. The public Better Auth verify/check/change-email
endpoints do not share the slice identifiers and cannot consume or complete
these challenges.

## Primary user and business value

Primary user: a pre-membership Free Start customer who controls both the
original saved-draft mailbox and the intended replacement mailbox. Loss of the
original mailbox is unsupported.

Business value: resume legitimate saved progress without duplicate entry while
preventing takeover, disclosure, duplicate users and account merge. Success is
the same `user.id` continuing the same owner-scoped draft with a replacement
sign-in email and no claim or membership mutation.

Entry point and exit remain inside the existing Free Start saved-draft manager;
no new route or dashboard is introduced.

## Exact writer map

Only these seventeen paths may change; any additional path stops the slice and
returns to authority.

Production/config writers:

1. `apps/web/src/actions/different-email-recovery.ts` — thin server-action entry
   with exact stage inputs only.
2. `apps/web/src/actions/different-email-recovery.core.ts` — neutral-host,
   authoritative-session, default-tenant, rate-limit and generic-result
   orchestration.
3. `apps/web/src/lib/auth/different-email-recovery-store.ts` — existing-table
   disabled-reservation challenge lifecycle, per-user advisory lock,
   confirm-time user-table lock, attempts/expiry, global canonical target
   collision, old-email CAS and exact-row cleanup.
4. `apps/web/src/lib/auth/different-email-recovery-email.ts` — SQ/EN/SR/MK
   purpose templates and awaited content-free delivery.
5. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/saved-draft-list.tsx`
   — mount one recovery entry and remain at or below 150 lines.
6. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/different-email-recovery.tsx`
   — bounded three-stage accessible client component.
7. `apps/web/src/messages/sq/freeStart.json`
8. `apps/web/src/messages/en/freeStart.json`
9. `apps/web/src/messages/sr/freeStart.json`
10. `apps/web/src/messages/mk/freeStart.json`
11. `scripts/repo-size-budget.json` — deterministic sync only.

Focused proof writers:

12. `apps/web/src/actions/different-email-recovery.core.test.ts`
13. `apps/web/src/lib/auth/different-email-recovery-store.contract-test-support.ts`
14. `apps/web/src/lib/auth/different-email-recovery-store.contract.test.ts`
15. `apps/web/src/lib/auth/different-email-recovery-email.test.ts`
16. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/different-email-recovery.test.tsx`
17. `apps/web/e2e/gate/different-email-recovery.spec.ts`

All modified/new source and test files remain at or below 150 lines except the
transaction store, which may use the repository's documented complex-backend
hard ceiling of 200 lines and must not exceed it. Locale edits replace the
existing one-line `secureSave` scalar without adding lines. The new component
owns its local copy type; `types.ts` is not a hidden writer.

### Seventeen-writer size disposition

The sole exceeded default budget is writer paths: seventeen instead of twelve.
The gate remains one outcome, three independently invalidatable proof surfaces,
one shared product consumer and one special environment. Arben must approve
this exact-hash disposition. The increase replaces the unsafe stock endpoint
assumption with an independently testable action/session layer, transactional
store, awaited mail boundary and real-Postgres support. Splitting those pieces
would activate identity primitives without a complete recoverable journey and
would not provide standalone user value. No further writer increase is allowed.

## Forbidden surfaces and non-goals

- `apps/web/src/proxy.ts`, canonical routes, host classification and clarity
  markers;
- Better Auth provider replacement, plugin activation for change-email, public
  sign-up, social linking, password reset, stock email-change endpoints, account
  merge/deletion or broad auth/session refactoring;
- changing `user.id`, tenant, branch, role, member number, subscription,
  entitlement, membership lifecycle or any account row;
- rewriting `free_start_drafts.owner_user_id`, copying/transferring/exposing
  draft facts, draft counts, claim numbers or claim state;
- new tables, columns, indexes, migrations, RLS policies, grants, database
  connection or dependency;
- draft-to-claim conversion, claim submission, payment, Paddle, documents,
  uploads, analytics, notifications, staff/agent/admin views or support recovery;
- lost-original-mailbox recovery, anonymous identity recovery, device
  fingerprinting, new cookies, localStorage, URL tokens or recovery links;
- `@interdomestik/shared-auth`, auth API routes, neutral-OTP boundary/sanitizer,
  `authConfig`, provider config, CI/CD, deployment, production, runner, README,
  AGENTS or architecture docs.

`IDA-UI03a2`, Hero redesign and membership-dashboard work remain separate.

## Highest-risk cases

1. The replacement path creates/selects another user or rewrites owner state.
2. Collision status/body/copy or server logs disclose an existing email.
3. Caller input selects a user, current email, tenant, draft or owner.
4. A stale session changes a user other than the owner-scoped manager user.
5. Replay, expiry, attempt exhaustion or supersession leaves a usable challenge.
6. Two starts, targets or confirmations race and leave the wrong challenge or
   update the same user twice.
7. Provider failure advances UI or leaves an active challenge.
8. Mixed-case/global collision, a concurrent user-table writer, CAS failure or
   database error bypasses containment or logs raw content.
9. OTP/address/draft data reaches URL, cookie, analytics, browser storage or logs.
10. Session-cache invalidation removes the session token or creates a new cookie.
11. Locale, keyboard, focus, reduced-motion or no-JavaScript behavior misleads
    or blocks the existing manager.

## Acceptance evidence

Focused action/email proof must demonstrate:

- exact stage schemas reject identity/draft/tenant selectors;
- neutral host, uncached authoritative session, default access tenant, the
  existing `OTP_RATE_LIMIT_HMAC_SECRET` under the `IDA-UI03b` domain separator
  and OTP IP/identity rate limits fail closed;
- current and replacement delivery is awaited, localized and content-free;
- preflight/store failure sends nothing and preserves prior committed state;
- current/replacement send, drift or activation failure returns generic 503 and
  leaves no active usable challenge or advanced client state;
- overlapping starts, collision, wrong code, expiry, third failed attempt,
  replay and supersession produce generic failure without address/draft
  disclosure;
- session-data cache expiry preserves the session-token cookie.

The Z620 PostgreSQL contract must demonstrate on the exact implementation:

- one challenge per user/stage under the advisory lock and five-minute,
  three-attempt, rotate semantics;
- preflight transaction rollback sends/activates nothing and preserves the
  exact prior challenge;
- after a successful superseding reservation commit, send/drift/activation
  failure leaves neither the prior nor new challenge active; overlapping starts
  cannot activate a superseded nonce;
- two replacement targets and concurrent confirmations yield exactly one
  old-email CAS update and no last-writer-wins result;
- mixed-case collision is globally equivalent, and a confirm-time collision or
  concurrent user-table insert/update is serialized, caught and returned
  content-free without an uncaught/logged database error;
- exactly the same `user.id`, tenant, role, membership/subscription/account rows,
  draft ids, owner ids and draft versions survive the email change;
- the active reservation is consumed once and no raw OTP is recoverable;
- unchanged owner-RLS list/resume/update/delete succeeds after the CAS.

Browser proof owns only the SQ/EN/SR/MK UI state machine, generic copy,
keyboard/focus, reduced motion, duplicate submit, reload and safe no-JavaScript
fallback. Transport may be stubbed and is not mutation proof. Existing
same-email secure save, anonymous recovery, inactive-manager mode and
active-member entry must remain green.

The real-Postgres proof runs only through the exclusive Z620 controller with a
task-owned disposable PostgreSQL 16 database. Mandatory implementation gates
are focused proof, `pnpm check:modularity-guard`, `pnpm repo:size:check`,
`pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, Sonar, CodeQL,
gitleaks, pnpm audit, exact-head reviewer/security feedback, finalizer and zero
unresolved threads. Full E2E runs once on the ready PR head. Codex Security diff
scan remains explicitly waived by user instruction.

## Rollback and stop conditions

Rollback is the exact implementation-merge revert. It disables new recovery
without changing an already committed email back or deleting drafts. Existing
same-email sign-in and owner-scoped management remain available; any reversal
of a completed email replacement requires separate repair authority.

Stop before mutation or merge if the existing session reader, verification
table, admin transaction, advisory lock, existing OTP HMAC secret, awaited content-free mail
primitive, old-email CAS or session-cache-only expiry cannot satisfy this exact
contract; if schema/migration/route/provider/shared-auth work is needed; if any
writer exceeds the approved map or line ceiling; if a locale gains lines; if
raw content reaches logs/errors; if two targets can remain usable; if account,
owner, draft, claim or membership state changes; or if exact-head evidence is
missing.

## Reviewer and resource contract

This is Tier 3. The Atlas routing plan is the exact seventeen-path map with one
writer, one implementation worktree, no Atlas real M7 cohort enrollment and a
Z620-only real-Postgres lane. Sentinel must disposition the exact gate before
mutation and the exact implementation head before merge. Opus 5 is exhausted
for this slice; GPT-5.6 Sol Max is the approved senior fallback. Do not resubmit
one running review.

Mac is control plane/light writer only; no Mac Docker. The later runtime receipt
must authorize one exclusive Z620 disposable-PostgreSQL proof after fresh disk,
memory, runner and lease preflight through the governed `--z620-power` path.
This docs-only gate authorizes no runtime or heavy job.

## Design-gate stop condition

Promotion requires a passing admission receipt, UI/UX receipt, bounded review,
current-head docs checks, matching program/tracker records and Arben approval of
these exact bytes and SHA-256. Only the canonical merge may make the resolver
select `IDA-UI03b`; a separate exact runtime receipt is then required before any
product mutation.
