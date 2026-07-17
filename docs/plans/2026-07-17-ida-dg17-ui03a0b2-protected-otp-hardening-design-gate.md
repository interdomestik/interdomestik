---
title: IDA-DG17 UI03a0b2 Protected OTP Hardening Design Gate
date: 2026-07-17
status: complete
authority: current_authority
runtime_authorized: false
promoted_slice: IDA-UI03a0b2
risk_tier: 3
owner: platform + product + security + privacy + accessibility + qa
---

# IDA-DG17 — UI03a0b2 Protected OTP Hardening Design Gate

## Promotion decision

Promote exactly one prospective Tier 3 implementation slice:
`IDA-UI03a0b2 — protected OTP route/tenant/verifier/rate/session hardening`.
The user-facing title is `Siguria e plotë e hyrjes me OTP`.

The Interdomestik UI/UX Orchestrator accepted the exact prospective design
packet at SHA-256
`ed9654ec78f1a2c246742bdb151a9dbf6d18d86a219049e346271918e8364f5c`
under Arben Lila's standing delegation for routine exact in-scope decisions.
The authority source is orchestrator thread
`019f6586-34cc-7311-900c-9989770f4d29`. This is delegated approval; it is not
represented as a direct contemporaneous message from Arben.

This promotion is docs-only and records `runtime_authorized:false`. Product or
test edits remain forbidden until this promotion merges, the worktree resolver
returns only `IDA-UI03a0b2`, and the orchestrator grants separate exact runtime
implementation authority. Promotion and later implementation authority do not
authorize rollout, deployment or production alias changes.

`IDA-UI03a1`, `IDA-UI03a2`, `IDA-UI03b` and `IDA-UI03a0c` remain unpromoted.
The stopped and archived UI04a work contributes no pricing, localization or
visual-isolation hypothesis to this slice.

## Current architecture truth

- Supabase Auth remains the repository-declared identity/session system of
  record.
- Better Auth 1.6.22 remains the active orchestrator/execution path. Its
  Drizzle adapter tables are not reclassified.
- `@interdomestik/shared-auth` remains the provider-agnostic boundary and its
  public API is unchanged.
- Existing `resolveDefaultPublicTenantId()` / `DEFAULT_PUBLIC_TENANT_ID` and
  `tenantClassificationPending` remain the neutral acquisition model. No new
  tenant, classification model or tenant inference is introduced.
- `apps/web/src/proxy.ts` remains read-only. Canonical routes and clarity
  markers are unchanged.
- Paddle remains the billing authority. This slice may only stop the existing
  continuation when a fresh session is not authoritative; it may not change
  price ids, checkout custom data, webhooks, catalog or entitlement behavior.

## Exact protected behavior

### Route, host and tenant

1. Only `/api/auth/email-otp/send-verification-otp` with `type=sign-in` is the
   neutral send, and only `/api/auth/sign-in/email-otp` is neutral verify.
2. A route-local exact allowlist accepts canonical `ida.interdomestik.com`,
   local `ida.localhost`, local `ida.127.0.0.1.nip.io`, and an exact configured
   `IDA_HOST`. Wildcards, globs and `VERCEL_URL` are forbidden. Direct `Host`
   must independently pass; forwarded host may restrict but never grant.
3. Current Vercel edge remains the sole deployed ingress and the trust basis
   for forwarded headers. Local/test authorization uses direct Host only. No
   proxy or general tenant-host resolver change is allowed.
4. Neutral send derives the existing default-public tenant on the server and
   accepts no tenant override. Neutral verify requires top-level creation hints
   matching the server-resolved default tenant and
   `tenantClassificationPending:true`.
5. Neutral send/verify do not call the current pre-verification user-tenant
   lookup. Password sign-in retains its current tenant guard.
6. Registered and unregistered send use one generic status/body/path and the
   same verifier-store, indexed user lookup and deferred-delivery sequence.

### Verifier, attempts and timing

1. Configure sign-in OTP with `storeOTP:'hashed'`, `expiresIn:300`,
   `allowedAttempts:3`, `resendStrategy:'rotate'`, and
   `disableSignUp:false`.
2. Preserve frozen 1.6.22 atomic consume: one correct code succeeds once;
   concurrent/replayed verification fails, and the third wrong attempt
   exhausts the record.
3. Provider delivery runs through Next 16.2.9 `after()` and cannot affect the
   response body/status. No fixed sleep, queue, provider or resource is added.
4. The retained production Node proof uses an optimized Next build, real HTTP
   `response.finish`, and one monotonic clock. Its three cases prove strict
   `http-finish < provider-start` for 50 ms success, 1200 ms success and 300 ms
   contained rejection. Proof SHA-256 is
   `d4134d3f760100128ab36114bc814d78c0829610c33a347b0cd87161aade006b`;
   raw trace SHA-256 is
   `e38adb2f7c2562d9a4c9361570c49cb0edac3c81b3ec5ac122f31a45dcf57dfa`.
5. A real-adapter registered/unregistered operation trace remains a mandatory
   RED/contract STOP. A mocked no-op `after()` is not acceptance evidence.

### Abuse limits and privacy

1. Send budgets are `3/IP/60s` and `3/HMAC-email/60s`; verify budgets are
   `3/IP/10s` and `3/HMAC-email/10s`.
2. Identity keys are
   `HMAC-SHA-256(OTP_RATE_LIMIT_HMAC_SECRET, tenant + NUL + email.toLowerCase())`.
   The secret is a distinct random per-environment value of at least 32 bytes;
   no secret value or environment mutation is part of this gate.
3. The identity-only Upstash constructor uses `analytics:false`. Raw email,
   plain email hashes, OTP, user id and session token are forbidden in keys,
   analytics and logs. Generic non-OTP limiter defaults remain unchanged.
4. A cold/hot Redis timing difference and recent-attempt inference from 429 are
   accepted abuse-control residuals; they do not distinguish whether an account
   exists because both account states execute the same calls.
5. Production client IP is the first valid `x-forwarded-for` address from the
   trusted ingress. `x-real-ip` is local/non-production fallback only. Missing
   IP, secret or Upstash and backend failure fail closed with content-free 503
   plus `Retry-After` on the production-sensitive OTP seam.

### Wrong-tenant and fresh-session defense in depth

1. Frozen sign-in success returns a raw session token and a newly signed cookie.
   On a post-proof wrong tenant, call
   `auth.api.revokeSession({body:{token},headers})` in-process with that new
   cookie transformed into the request `Cookie` header. No loopback HTTP and no
   direct Drizzle delete are allowed.
2. Every wrong-tenant branch strips all Better Auth session `Set-Cookie` values
   before returning `accountStop`, including when revoke throws. Failed deletion
   may leave an undisclosed, unusable row until its existing TTL; only a
   content-free revocation-failed category is emitted. No Supabase revocation is
   claimed.
3. Before Paddle continuation, call
   `auth.api.getSession({headers,query:{disableCookieCache:true,
disableRefresh:true}})` with the new cookie. No React, Next Data Cache or
   process cache wrapper is allowed; an adapter spy must prove `findSession`.
4. Continue only when that authoritative row matches the verify response user,
   a fresh server resolution of the default-public tenant, and
   `tenantClassificationPending:true`. Missing, revoked, mismatched,
   already-classified or stale sessions stop with zero Paddle/open analytics.

## Binding pre-product-edit STOP

Before the first production edit, frozen Better Auth 1.6.22 RED contracts must
prove all of the following together:

- raw token exists on sign-in response;
- the new signed cookie becomes the in-process request `Cookie` header;
- revoke authorization re-reads the stateful session and deletes exactly the
  new token's row, not another session;
- revoke failure always strips the response cookie;
- the registered/unregistered real-adapter pre-response trace is identical;
- the anonymous seam makes no parallel Supabase session call;
- fresh continuation bypasses cookie cache and re-reads Drizzle.

Any failed contract, dependency drift, user-dependent pre-response branch,
scope ceiling overrun or need for a protected surface outside this document is
STOP and returns to the orchestrator. Cookie stripping and the independent
fresh-session guard are both mandatory and neither may be dropped.

## UI/accessibility and localization

The accepted UI03a0b1 SQ/EN/SR/MK UI, copy, focus recovery, keyboard and
screen-reader semantics, 44 px actions, mobile/desktop behavior, 200% zoom,
WCAG text spacing, reduced motion, forced colors and JavaScript-off truth remain
unchanged. This is hardening, not a page or pricing redesign. Before the later
implementation merge, the changed journey must be left open on localhost and
Arben must answer the non-delegated visual checkpoint `Si duket?`.

## Exact ceiling and test allocation

Hard ceilings: at most 14 production files (expected 11), at most 13 test/spec
files (expected 11), exactly 26 authored focused cases and at most four
engineering days. New or extracted production files stay at or below 150 lines;
touched large route/core/rate files must shrink. `pricing-table/index.tsx`,
`checkout-actions.ts`, `proxy.ts`, schema/RLS/migrations and Paddle modules are
read-only.

The 26 cases are exactly: four host/path; four tenant/hint/enumeration; four
hashed-verifier/attempt/replay; four send/verify-rate/fail-closed; three
deferred-send; three fresh-session/revocation (cleanup success, revoke failure
with cookie stripped, missing/mismatched fresh session); two Paddle-stop; two
E2E localization/accessibility/no-regression.

## Benchmark and review truth

The contemporaneous four-operator benchmark covers Better Auth OTP storage and
attempts, Supabase rate separation, Auth0 identifier/IP brute-force protection,
and Upstash analytics behavior. Benchmark draft SHA-256 is
`4381c74a58b555dadc45b9495a32bf625739b65f1a1f616473d9a57cb500c977`;
the delegated approval-bearing receipt SHA-256 is
`54a67728e73c2f3ea22479f986b6dcb8563e565d6bccc28f6de4e4486ecf10b8`.
Only principles are used; operator wording, sequence, layout, branding,
illustration and trade dress may not be copied.

The advisory UI/UX checker truthfully returns `advisory_blocking` only for
`UI_UX_APPROVER_INVALID`, because it hard-codes literal `Arben` while the actual
accepted actor is the delegated orchestrator. Mismatch receipt SHA-256 is
`e045f3b2355b688ccb488320d8ee3a8544ffd8846abae4f2f9a987c73b8a3ada`.
The checker is advisory-only and reports `repoAuthorityUnchanged:true`; this
document does not fabricate a direct Arben approval.

Gemini first pass rejected the then-unproven timing assumption. Sonnet first
pass ratified with conditions. After the production proof, Gemini's second
route was formally blocked on quota despite PASS stdout and is not counted.
Sonnet second pass and Opus 4.8 arbitration both
`RATIFY_WITH_CONDITIONS`, with no HIGH/CRITICAL finding and the frozen-contract
STOP above binding. Review-disposition receipt SHA-256 is
`ce78ef1167f3cb631f39bcbba80d08d21c40c69042850b4187286ced96703bb3`;
frozen session API receipt SHA-256 is
`0b4246fa806fa4a3a0bacb71a45c2158091a8ae440c28b1c0b9c6f9a9d3fa8d2`.
Fable 5 was skipped because access was not explicitly confirmed.

## Authority and exclusions

Promotion starts from clean main/origin at
`7ce941328630884b0d6dc672a4a037ab108ffd9f`. Fresh AI OS observation
`88cb0621b85047b39276cadd77ee840d7bacdbf6ce2bb94ec55e839eaeeb6ad5`
reported Interdomestik and Brain current, `activeSlice=none` and runtime not
authorized. Before promotion, the resolver returned
`blocked_requires_current_authority / umbrella_without_concrete_promoted_slice /
activeSlice=null`.

The mid-task Brain measurement used exactly two initial passes and one narrow
recovery search. It found general constraints and the prior forecast but missed
decisive current authority and exact source/test seams; repo proof did the
decisive work. No full-task time/token saving is claimed and `humanUseful`
remains `unknown/not_confirmed` until Arben explicitly confirms usefulness.

Excluded: proxy/canonical-route changes; schema/RLS/migrations; tenancy
architecture; Supabase mutation or revocation claim; shared-auth public API;
new provider/resource; Paddle/billing/payment authority; durable OTP or
pre-verification analytics/idempotency sink; pricing/copy/page redesign;
production alias; rollout; deployment; later IDA slices; README, AGENTS and
broad architecture documents.

After this docs-only promotion merges, sync current main and require the
worktree resolver to return exactly `IDA-UI03a0b2`. Then stop and request
separate exact runtime implementation authority. No deployment is authorized.
