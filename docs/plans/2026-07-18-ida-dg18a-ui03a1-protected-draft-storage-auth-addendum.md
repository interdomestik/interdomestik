---
title: IDA-DG18A UI03a1 Protected Draft Storage and Neutral Auth Reuse Addendum
date: 2026-07-18
status: prospective_review_accepted
authority: advisory_until_merged
runtime_authorized: false
parent_gate: IDA-DG18
parent_sha256: 1138cb80e9def6fbbe041f333dcee16269bed9a8a95dabb00f2084ec467e1e78
sole_slice: IDA-UI03a1
risk_tier: 3
---

# IDA-DG18A — Protected Draft Storage and Neutral Auth Reuse

## Exact binding

This separate protected-surface addendum binds only prospective parent design
`IDA-DG18` at exact SHA-256
`1138cb80e9def6fbbe041f333dcee16269bed9a8a95dabb00f2084ec467e1e78` and only
slice `IDA-UI03a1`.

It authorizes no runtime work until both documents merge, the worktree resolver selects
only `IDA-UI03a1`, and delegated orchestrator acceptance binds the final reviewed hashes.
If the parent design changes, this addendum is invalid until its hash and reviews are
updated. It does not authorize deployment, rollout, provider mutation or an adjacent slice.
The parent's named detached binding receipt records both final document digests at
acceptance; this gives reciprocal proof without an impossible circular embedded hash.

## Protected authority granted prospectively

The later implementation may add exactly one additive database table and migration, its
owner/access RLS policy, focused migration/RLS tests, a draft-local actor context inside the
repository transaction, and behavior-preserving extraction of the existing neutral email
OTP client hook so both pricing and Free Start call one accepted Better Auth seam.

No shared tenant helper, proxy, route, auth route, server auth configuration, provider,
session schema, shared-auth public API, Supabase resource, Paddle module or canonical route
may change.

## Exact table contract

Table: `free_start_drafts`.

Columns:

- `id text primary key`: server-generated random UUID.
- `tenant_id text not null references tenants(id)`.
- `access_tenant_id text not null references tenants(id)`.
- `owner_user_id text not null references "user"(id)` with the default no-action delete
  behavior.
- `client_request_id uuid not null`: client-generated idempotency key, never authority.
- `category text not null`: only `vehicle|property`.
- `issue_type text null`: only the existing vehicle/property issue ids and coherent with
  category.
- `incident_date date null`.
- `counterparty varchar(160) null`.
- `desired_outcome text null`: only the four existing outcome ids.
- `summary varchar(1000) null`.
- `resume_step text not null`: only `category|details|preview`.
- `version integer not null default 1`, constrained greater than zero.
- `created_at` and `updated_at` timestamp with time zone, non-null and server-authored.

Checks require `tenant_id = access_tenant_id`, the exact category/issue matrix below,
accepted enums and bounds. Empty UI strings are normalized to SQL null; API reads restore
them as empty strings.

- `vehicle`: `collision|theft|parking_damage|insurer_delay` or null.
- `property`: `water_damage|storm_fire|burglary|landlord_dispute` or null.
- Every cross-category or injury issue id is rejected by both Zod and a database check.

No email, OTP, session token, IP, health field, upload, result, claim, case, membership,
billing or provider identifier is stored.

Indexes:

- unique `(access_tenant_id, owner_user_id, client_request_id)` for create idempotency;
- listing `(access_tenant_id, owner_user_id, updated_at desc, id desc)`;
- no cross-owner lookup index or public token.

The table is added to the critical RLS proof set. Migration is additive only; no existing
column, policy, enum or table is altered.

## Exact RLS and actor-context contract

RLS is enabled. One all-command policy requires both expressions for read/write/check:

```sql
access_tenant_id =
  (select current_setting('app.current_access_tenant_id', true))::text
and owner_user_id =
  (select current_setting('app.current_actor_id', true))::text
```

Missing or empty actor/access context therefore returns no rows and rejects writes. The
application role does not bypass RLS. Direct admin access is test setup/cleanup only and is
not used by the product path.

The new `app.current_actor_id` setting is local to the `free_start_drafts` repository
transaction. A focused `withFreeStartDraftContext` wrapper calls existing
`withTenantContext({tenantId, accessTenantId})`, then parameterizes
`set_config('app.current_actor_id', ownerUserId, true)` before the first draft or audit
statement. `packages/database/src/tenant.ts` is read-only. The actor setting is never
accepted from client input and is not exposed as a general tenancy primitive.

Verified base-SHA repo fact: existing `withTenantContext` runs one real
`dbRls.transaction`, enables row security, then sets
`app.current_tenant_id` and `app.current_access_tenant_id` with transaction-local
parameterized `set_config(..., true)` before invoking its callback. Draft mutation and the
direct `audit_log` insert both run inside that same callback/transaction, after the local
actor setting. If this exact fact drifts before implementation, STOP; do not edit the shared
helper to restore the assumption.

Every repository query also predicates access tenant and owner in SQL as defense in depth.
Tests must prove RLS, not only mocked predicates. One live query deliberately omits the
application owner predicate and proves the RLS actor sees its own row but never a peer
owner's same-tenant row; RLS remains the final barrier if query scoping regresses.

## Exact session and host contract

Each draft server action:

1. obtains request headers server-side;
2. reuses the existing exact neutral IDA host predicate from
   `apps/web/src/app/api/auth/[...all]/neutral-otp-boundary.ts` without modifying that file;
3. obtains one authoritative Better Auth session with
   `{disableCookieCache:true, disableRefresh:true}`;
4. obtains the neutral home tenant through existing server-only
   `resolveDefaultPublicTenantId` in `apps/web/src/lib/tenant/tenant-hosts.ts` and the access
   tenant through existing `resolveSessionTenantConcepts` in
   `apps/web/src/lib/tenant/tenant-session-context.ts`;
5. requires a non-empty user id and requires that authoritative session access tenant to
   equal the independently server-resolved neutral home tenant for this pre-membership seam;
6. passes only those server-derived values into the draft repository.

Host denial is `unavailable`; missing/non-authoritative session is `authRequired`; missing
tenant or malformed session fails closed without a query. Divergent session-access/neutral-home
tenant returns localized `unavailableAccountContext` without a query so the denial is
explicit. The compatibility `session.user.tenantId` is not treated as an independent home
tenant because both existing session helpers use it only as an access-tenant fallback.
Wrong-owner, wrong-tenant and unknown draft ids use one generic `notFound` result.

No parallel Supabase session call, provider call, loopback HTTP, CORS bridge, cookie copy,
cross-origin state bridge, password flow, tenant hint override or entitlement lookup is
introduced. Supabase Auth, Better Auth and shared-auth retain their current declared roles.

Verified base-SHA repo facts: `user.email` is unique, `session.userId` references
`user.id`, and the frozen Better Auth OTP contract proves a fresh non-cached session returns
the id created by the completed OTP sign-in. The base test does not yet prove a second
completed same-email sign-in reuses that id. Therefore, before any schema, migration or
product edit, test-only precondition `P00` extends the existing frozen-adapter contract and
must prove two completed neutral OTP sign-ins for one normalized email return the same user
id, leave exactly one `user` row, and satisfy the proposed owner FK. Failure is STOP; it
does not authorize UI03b, provider, route or auth/session architecture changes.

## Exact neutral OTP reuse contract

The current 150-line `usePricingEmailOtp` logic is extracted without behavior change into a
focused generic client hook, `useNeutralEmailOtp`, and the pricing hook becomes a typed
wrapper. Existing pricing tests remain binding. Free Start supplies its own purpose-specific
UI/copy and invokes the same generic hook.

The hook continues to use only:

- `authClient.emailOtp.sendVerificationOtp({email,type:'sign-in'})` with the existing
  allowlisted locale header;
- `authClient.signIn.emailOtp` with server-provided default-public tenant hint and
  `tenantClassificationPending:true`;
- existing destination lock, cooldown, resend, generic errors, account-stop, one pending
  operation and one continuation guard.

The Free Start UI receives the existing default-public tenant id from the server-rendered
home boundary; it never derives or accepts tenant authority from URL, host, email or draft
input. The host predicate still decides server authorization. No code or copy from the
pricing checkout presentation is reused.

## Exact transactional behavior

Create:

- set tenant/access/actor context;
- take one transaction-scoped 64-bit advisory lock from
  `pg_advisory_xact_lock(hashtextextended(owner_user_id, 0))`; a rare collision may
  serialize unrelated owners but cannot grant access or corrupt isolation;
- return the existing owner/client-request row if present;
- count only that owner’s visible drafts and fail at 200;
- insert one row and one content-free `free_start_draft.created` audit row atomically.

Update:

- one update predicates id, access tenant, owner and expected version;
- increment version and set server time;
- zero rows triggers one owner/access-RLS-scoped re-read by id: a visible row is `conflict`
  with its latest version, while no visible row is generic `notFound`; wrong-owner,
  wrong-tenant and unknown rows remain indistinguishable;
- insert `free_start_draft.updated` audit with only resulting version.

Resume:

- one owner/access-scoped select returns the six facts and current version;
- insert `free_start_draft.resumed` audit with only version in the same transaction;
- unknown/wrong owner returns generic not-found and writes no audit.

Delete:

- one delete predicates id, access tenant, owner and expected version; zero rows uses the
  same owner-scoped conflict/not-found classification before any audit;
- insert `free_start_draft.deleted` audit with only deleted version in the same transaction;
- the fact row is not soft-deleted, copied or recoverable through this feature.

Audit rows use the existing `audit_log` table and contain actor id, actor role if already
available, access tenant as tenant, action, entity type `free_start_draft`, the exact draft
row's server-random UUID as entity id, version and timestamp only. They contain no fact
values or request metadata. This preserves per-draft forensic correlation without storing a
fact copy. The existing best-effort `logAuditEvent` helper is not used because mutation and
audit must be one atomic transaction.

Verified base-SHA audit fact: the existing table has text `action`, `entity_type` and
`entity_id` plus JSONB `metadata`; migration `0083` leaves its all-command RLS policy with
both `USING` and `WITH CHECK` on `tenant_id = app.current_access_tenant_id`. A local
transactional proof temporarily granted only INSERT to the non-bypass
`interdomestik_rls_test` role, set tenant/access/actor context, inserted the exact proposed
content-free shape, reset role and rolled back. It produced `INSERT 0 1`; post-rollback row
count and temporary-grant count were both zero. No audit schema/policy edit is required.
Implementation adds this rollback proof to the durable live-RLS test; drift or failure is
STOP before product edits.

Verified base-SHA lifecycle fact: `audit_log.actor_id` already references `"user"(id)`
without an `ON DELETE` action. A lifecycle audit row can therefore block user deletion, so
this slice makes no account/user cascade promise and does not change that audit-retention
contract. Owner-requested draft hard delete remains required; broader account deletion or
audit anonymization requires separate authority.

## Strict request contract

The action boundary uses strict Zod discriminated inputs and rejects unknown keys. Create
and update accept only the six fact slots, resume step, UUID client request id for create,
and id/expected version for update/delete. Actor, tenant, access tenant, email, status,
timestamps and audit metadata are never accepted.

Partial save requires a supported category. Issue/category coherence is checked whenever
issue is present. Date is a valid ISO calendar date. Counterparty is at most 160 characters;
summary at most 1000 transformed characters. Counterparty and summary are transformed by
Unicode NFKC, CRLF/CR-to-LF conversion and leading/trailing Unicode-whitespace trim, in
that order. Internal whitespace, casing and punctuation otherwise remain unchanged; an
empty result is stored as SQL null and returned to the UI as an empty string. This transform
is idempotent. Category, issue, desired-outcome and resume-step identifiers receive no
coercion and must exactly equal an accepted id. Incident date must be a real ISO
`YYYY-MM-DD` calendar date and round-trips identically. These normalized values are what
zero-reentry tests compare.

After Unicode NFKC normalization and lowercase whole-letter tokenization, summary is
rejected when a token equals one of this fixed non-logging spill-guard set:

- EN: `injury`, `injured`, `doctor`, `hospital`, `pain`, `blood`, `medical`, `diagnosis`,
  `treatment`.
- SQ: `lëndim`, `lënduar`, `mjek`, `mjeku`, `spital`, `dhimbje`, `gjak`, `mjekësor`,
  `diagnozë`, `trajtim`.
- SR: `povreda`, `povređen`, `povređena`, `lekar`, `doktor`, `bolnica`, `bol`, `krv`,
  `medicinski`, `dijagnoza`, `lečenje`.
- MK: `повреда`, `повреден`, `повредена`, `лекар`, `доктор`, `болница`, `болка`, `крв`,
  `медицински`, `дијагноза`, `лекување`.

The error is a generic localized `remove medical details before saving`; neither input nor
matched token is logged/audited. After the stated normalization and locale-independent
lowercasing, the check uses exact whole-letter-token equality. It does not match substrings,
plurals, fuzzy forms or other unlisted variations; every token not exactly equal to a term
above passes this guard. This guard
reduces obvious spill only and does not authorize health persistence or claim semantic
medical detection.

## Exact protected file ceiling

Production/config/migration files allowed by this addendum:

1. `packages/database/src/schema/free-start-drafts.ts` (new)
2. `packages/database/src/schema/index.ts`
3. `packages/database/drizzle/0092_ida_free_start_drafts.sql` (new)
4. `packages/database/drizzle/meta/_journal.json`
5. `packages/database/drizzle/meta/0092_snapshot.json` (generated)
6. `packages/database/package.json`
7. `packages/database/src/free-start-drafts.ts` (new entry/export)
8. `packages/database/src/free-start-drafts/contracts.ts` (new)
9. `packages/database/src/free-start-drafts/context.ts` (new)
10. `packages/database/src/free-start-drafts/create.ts` (new)
11. `packages/database/src/free-start-drafts/read.ts` (new)
12. `packages/database/src/free-start-drafts/mutate.ts` (new)
13. `apps/web/src/components/auth/use-neutral-email-otp.ts` (new)
14. `apps/web/src/components/pricing/pricing-table/use-pricing-email-otp.ts`

`apps/web/src/components/pricing/pricing-table/types.ts` is read-only. The generic hook owns
its private generic input/output types; the existing pricing hook retains its current public
signature and adapts internally. Existing pricing OTP behavior-parity tests are a merge gate.

Protected proof/support files:

1. `packages/database/test/free-start-drafts-migration.test.ts` (new)
2. `packages/database/test/free-start-drafts-rls.test.ts` (new)
3. `packages/database/test/critical-rls-tables.test.ts`
4. `apps/web/src/components/auth/use-neutral-email-otp.test.ts` (new)
5. existing pricing OTP tests only for behavior-preserving expectation updates
6. `apps/web/src/lib/auth/better-auth-email-otp.contract.test.ts` for test-only `P00`
7. deterministic `scripts/ci/db-access-baseline.json` only after guard classification

The slice-wide parent ceiling remains controlling. Any additional protected production
file, shared tenant helper edit, auth route edit, schema/RLS behavior change, migration
renumbering or case allocation expansion requires a new exact hash-bound addendum before
the edit.

## Required protected proof

- Migration static proof: exact columns, checks, indexes, RLS enabled, actor+access policy,
  no forbidden fields and journal/snapshot consistency.
- Live RLS proof under the non-bypass application role: no context, wrong actor in same
  tenant, wrong access tenant, forged insert owner/tenant, correct owner CRUD, hard delete
  and proof that the owner FK retains its default no-action user-delete behavior.
- 101-owner concurrent integration proof and one same-draft compare-and-swap race. The 101
  creates launch from one shared client latch through the bounded pool and assert 101
  successes plus per-owner visibility without a wall-clock oracle. Two same-draft updates
  wait on a two-party latch with one expected version and assert exactly one success, one
  conflict and one version increment.
- Session core proof: exact host, no session, stale/revoked session, missing access tenant,
  session-access/neutral-home divergence, server-derived authority and generic wrong-owner
  result.
- Test-only `P00` stable-owner proof must pass before migration or product edits: two
  completed same-email OTP sign-ins, one user id, one user row and valid owner FK.
- Auth extraction proof: all existing pricing OTP cases unchanged plus Free Start intent
  retry, destination lock, cooldown, generic failure and duplicate continuation.
- Content-free audit proof for create/update/resume/delete, including rollback when the
  audit insert fails.
- DB-access guard, security guard, CodeQL/Sonar/reviewer and current-head migration/RLS
  gates before merge.

## Protected STOP and rollback

STOP if owner RLS cannot work without modifying shared `tenant.ts`, if a provider/session
resource or auth route must change, if access/home divergence must be supported, if health
or upload persistence becomes necessary, if atomic audit requires a broad audit refactor,
if the database role bypasses the new policy, or if test-only `P00` does not prove stable
same-email owner identity before any schema/migration/product edit.

Rollback is code-first and non-destructive: remove UI/actions and keep the additive table
and RLS dormant. Do not drop a table containing user drafts in an automatic rollback. A
later deletion migration requires explicit data-handling authority and proof. No deployment
is authorized by this addendum.
