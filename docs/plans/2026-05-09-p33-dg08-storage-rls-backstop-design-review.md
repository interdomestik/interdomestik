---
status: design-review
date: 2026-05-09
slice: P33-DG08
title: Storage RLS Backstop Design Review
owner: platform
phase: Phase C
---

# P33-DG08 Storage RLS Backstop Design Review

## Decision

`P33-DG08` promotes one bounded implementation slice:

`P33-SEC06 Storage Tenant-Prefix Backstop`

The goal is to add a structural storage-isolation backstop under the current
app-side authorization model without reopening proxy, routing, auth layering,
tenant identity architecture, canonical routes, product UX, Stripe, or broad
schema design.

The implementation should make this class structurally harder to reintroduce:

> A route authenticates one tenant, accepts or derives a Storage bucket/path, and
> accidentally serves, signs, uploads, verifies, or iterates an object belonging
> to another tenant because Storage access is only protected by route-local
> app-side checks.

The slice must not claim that Storage RLS protects service-role clients. Supabase
service keys bypass RLS by design. SEC06 must therefore combine Storage RLS for
authenticated clients with service-role callsite containment for server-side
Storage operations.

## Inputs

| Input                                              | Relevance                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P33-DG07`                                         | Promoted DG08 after CSP nonce enforcement was paused by architecture.                                                                                                                                                                                                                |
| `P33-SEC04B` (merged, PR `#686`, merge `a3e620ea`) | DB access posture burn-down is complete. SEC04B reduced the SEC04A unclassified DB posture count from `262` to `80`, leaving hard cases for targeted migration rather than mass-stamping. SEC06 applies the same measured-containment posture to Storage instead of broad rewriting. |
| `docs/security/storage-access-baseline.md`         | Baseline inventory for buckets, policies, path templates, and service-role Storage callsites.                                                                                                                                                                                        |
| Supabase Storage docs                              | Confirm that Storage access policies are RLS policies on `storage.objects`, path helpers such as `storage.foldername(name)` are supported, and service keys bypass RLS.                                                                                                              |
| Current migrations                                 | Show private `claim-evidence` and `policies` buckets with legacy user-prefix policies.                                                                                                                                                                                               |
| Current app code                                   | Shows active tenant-prefixed paths under `pii/tenants/...` and multiple service-role Storage callsites.                                                                                                                                                                              |

## Current Repo State

Current bucket inventory:

- `claim-evidence`
- `policies`

Current active path templates:

- `pii/tenants/{tenantId}/claims/{claimId}/{fileId}.{ext}`
- `pii/tenants/{tenantId}/claims/{actorId}/unassigned/{fileId}-{safeName}`
- `pii/tenants/{tenantId}/policies/{userId}/{timestamp}_{safeName}`

Current Storage policy mismatch:

- `claim-evidence` policies still allow authenticated user paths shaped as
  `pii/claims/{auth.uid()}/...`.
- `policies` policies still allow authenticated user paths shaped as
  `pii/policies/{auth.uid()}/...`.
- Active app paths are tenant-prefixed and therefore are not covered by the
  current authenticated-user policy shape.
- Service-role Storage access is allowed broadly and bypasses these policies.

Current service-role Storage inventory:

- `11` `createAdminClient()` Storage callsites in `apps/web/src`.
- `2` additional direct service-role Storage clients initialized from
  `SUPABASE_SERVICE_ROLE_KEY`.

Preliminary risk triage of the 13 callsites (to be confirmed against
`docs/security/storage-access-baseline.md` before SEC06 begins):

| Risk tier | Operations                                                                 | Count | SEC06 treatment                                                                                                                                  |
| --------- | -------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| High      | Sign download URL, sign upload URL, direct object read                     |    11 | Must be migrated behind the service-role boundary in SEC06; no allowlist entries permitted without named follow-up.                              |
| Medium    | Direct upload or object existence/metadata verification                    |     2 | Migrate to boundary; allowlist entry acceptable only if the callsite can be proven tenant-path-constrained and not able to read or sign objects. |
| Low       | Internal CI/seed artifacts, test helpers that never reach production paths |     0 | May be excluded from boundary requirement; must be confirmed test-only and excluded from the prod build.                                         |

SEC06 must re-confirm these counts from `docs/security/storage-access-baseline.md`
as the first step and confirm the triage before touching any callsite.

## Attacker Model

SEC06 must name and test against these failure modes.

### 1. Tenant-B Path Forgery

Authenticated tenant-A user reaches a route that signs or downloads Storage
objects. A future route or refactor forgets the path-derivation discipline and
accepts a tenant-B path such as `pii/tenants/tenant-b/...`. If the server calls
service-role Storage directly, Storage RLS does not stop the read.

SEC06 response: centralize server-side Storage calls behind wrappers that require
the authenticated tenant ID and assert the bucket plus path prefix before any
Storage API call. Add negative unit tests proving a tenant-B path fails before a
Storage method is invoked.

### 2. Service-Role Key Exposure Or Misuse

If `SUPABASE_SERVICE_ROLE_KEY` is leaked through environment exposure,
misconfigured CI, or accidental client bundling, Storage RLS does not protect
objects. Supabase documents service keys as bypassing RLS.

SEC06 response: do not pretend bucket policies solve this. Reduce blast radius
inside the app by forbidding new ad hoc service-role Storage clients, routing
approved service-role operations through a narrow server-only boundary, and
verifying no service-role Storage import reaches client components. Full
service-role key compromise remains a secrets-management risk outside SEC06 and
requires a separate key-scoping or platform control gate if the program wants to
eliminate it.

### 3. Mass Export By Missing Tenant Filter

A route authenticates one user but iterates documents, claims, policies, or
Storage object paths without tenant filtering, then signs or downloads each
object with service-role Storage.

SEC06 response: wrappers must not expose generic bucket listing or arbitrary path
iteration to routes. Any allowed list/verify operation must accept an explicit
tenant ID and tenant-prefixed folder, and tests must prove cross-tenant folder
input is rejected before Storage is called.

### 4. Signed URL Exfiltration or Lifetime Abuse

A route correctly derives a tenant-scoped path and issues a signed URL. That URL
is then leaked through application logs, a referrer header on redirect, a
misconfigured CDN access log, or XSS while `CSP_NONCE_MODE` is still not in
enforce mode. The signed URL is bearer-held for its full TTL — once issued, RLS
and app-side checks do not revoke it.

SEC06 response: SEC06 does not eliminate this class, but must not make it worse.
Specifically:

- Signed URL TTL must be the minimum practical lifetime for the operation
  (upload confirmation windows and download sessions should differ; neither
  should default to a platform maximum).
- Signed URLs must not be written to application logs, error traces, or response
  headers that downstream infrastructure may persist.
- SEC06 must record that this class is not solved by Storage RLS or the
  service-role boundary and that full elimination requires CSP enforce mode plus
  a secrets-hygiene audit of logging config. That tracking belongs in the same
  platform/secrets gate referenced in failure mode 2.

## SEC06 Scope

SEC06 may touch:

- `supabase/migrations/**` for Storage policy migrations only;
- storage helper modules under `apps/web/src/lib/storage/**`;
- existing Storage callsites and focused tests under `apps/web/src/**`;
- a focused guard or audit script if it is needed to block new direct
  service-role Storage usage;
- `docs/security/storage-access-baseline.md` only to append implementation
  receipts.

SEC06 must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, `/admin`;
- auth provider layering or session shape;
- tenancy architecture outside Storage policy predicates and Storage path
  assertions;
- product UX or clarity markers;
- Stripe;
- README, AGENTS, or architecture docs.

SEC06 may add a Supabase Storage RLS migration even though general schema work
remains out of scope. That authorization is limited to `storage.objects` policies
and policy-helper SQL required to enforce the current tenant-prefixed Storage
paths. It does not authorize application table redesign.

## Required Implementation Shape

### 0. Callsite Triage and RLS Join Mechanism (Pre-Implementation Gate)

Before writing any migration or wrapper code, SEC06 must confirm two items:

**Callsite triage:** fill the preliminary risk triage table in the Current Repo
State section above from `docs/security/storage-access-baseline.md`. Confirm
high/medium/low counts and get sign-off before touching callsites.

**RLS join mechanism:** confirm the exact SQL mechanism for deriving
`sessionTenant` in a Storage RLS policy. The two candidate approaches are:

1. Direct join from `auth.uid()` to an existing app user table column that holds
   `tenantId` — requires that table to be accessible inside `storage.objects`
   policy context without a security definer function.
2. A `SECURITY DEFINER` helper function (e.g., `auth.tenant_id()`) that wraps
   the join and is callable from policy predicates — the safer pattern if the
   user table is not directly joinable from Storage policy context.

SEC06 must confirm which mechanism the repo's current auth model supports and
record the decision with the exact table name and column before the RLS migration
is written. If neither mechanism is available without introducing new auth
infrastructure, that is a design blocker that must be raised before SEC06 starts,
not discovered mid-implementation.

### 1. Legacy Object Preflight

Before dropping or narrowing legacy policies, SEC06 must produce a preflight
check as a local migration script (not an ad hoc query) that answers:

- how many objects exist under `claim-evidence/pii/claims/%`;
- how many objects exist under `claim-evidence/pii/claims/%/voice-notes/%`;
- how many objects exist under `policies/pii/policies/%`;
- how many objects exist under the current `pii/tenants/%` shape for both
  buckets.

The preflight script must be committed to `supabase/migrations/` as a named
artifact so the result is reproducible and reviewable. It must not be a one-off
console query.

If legacy object counts are non-zero, SEC06 must stop before destructive policy
removal and produce a migration plan. If counts are zero, SEC06 may retire the
legacy authenticated-user policies in the same slice.

### 2. Tenant-Prefix Storage RLS

Add authenticated-client policies for the current path model:

- `claim-evidence`: allow authenticated operations only under
  `pii/tenants/{sessionTenant}/claims/...`.
- `policies`: allow authenticated operations only under
  `pii/tenants/{sessionTenant}/policies/...`.

The policy must use the join mechanism confirmed in step 0. It must not rely on a
tenant claim that the repo does not currently issue.

**Predicate shape:** Use `storage.foldername(name)` structured path extraction
where the path structure permits it. For the current three-segment fixed prefix
(`pii/tenants/{tenantId}/...`), the expected policy shape is:

```sql
-- example shape only; exact table/column confirmed in step 0
(storage.foldername(name))[1] = 'pii'
AND (storage.foldername(name))[2] = 'tenants'
AND (storage.foldername(name))[3] = (
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
)
```

Any fallback to `LIKE` must be justified with a test that rejects all of:
traversal inputs (`../`), empty segment (`pii/tenants//claims/`), and
sibling-prefix inputs (`pii/tenants/tenant-a-extra/...` matching against
a `tenant-a` assertion).

### 3. Service-Role Storage Boundary

Introduce a server-only Storage boundary for service-role operations. The
boundary must require:

- bucket;
- tenant ID;
- expected operation kind;
- expected entity context, such as claim ID, policy user ID, or document row;
- storage path or folder.

The boundary must assert that the storage path is tenant-prefixed and belongs to
the expected entity before calling `.storage.from(...)`.

SEC06 must migrate the current direct service-role Storage callsites or, if a
callsite cannot be migrated safely in the slice, add an explicit allowlist entry
with a named follow-up. No raw `createAdminClient().storage` or direct
`createClient(...SUPABASE_SERVICE_ROLE_KEY).storage` usage should remain outside
the boundary without an allowlist receipt.

### 4. No Generic List Or Export API

The boundary must not expose generic list-by-bucket or list-by-prefix helpers to
route code. The only allowed list-like operation in SEC06 is object-existence or
metadata verification for a single already-derived path or a tenant-asserted
folder used for upload confirmation.

### 5. Signed URL Constraints

Signed URLs issued by the service-role boundary must:

- use the minimum practical TTL for each operation kind (upload confirmation
  windows and download sessions are different use cases and must not share a
  default maximum);
- not be written to application logs, structured log fields, error traces, or
  response headers where downstream infrastructure may persist them;
- not be returned in responses that are cached by CDN or edge layers without
  a `Cache-Control: no-store` or equivalent directive.

SEC06 must add a receipt to `docs/security/storage-access-baseline.md`
confirming the TTL values chosen and the log-exclusion mechanism used.

### 6. Tests And Receipts

SEC06 must include focused proof for:

- tenant-A path to tenant-B rejection before Storage is called;
- legacy path rejection when the current tenant-prefixed shape is required;
- signed upload URL creation rejects mismatched tenant/path inputs;
- signed download URL or direct download rejects mismatched document tenant/path;
- policy upload/download rejects mismatched tenant/path inputs;
- the service-role Storage guard/audit fails on a new direct service-role
  Storage callsite outside the approved boundary;
- Storage RLS SQL policy predicates match the current bucket/path templates;
- traversal, empty-segment, and sibling-prefix inputs are rejected by the RLS
  predicate (or by the app boundary if LIKE fallback is used).

If a local Supabase test is not feasible, SEC06 must state the exact blocker and
include the strongest static SQL proof plus Supabase advisor output available in
the runtime.

## Acceptance Criteria

SEC06 passes only if all of the following are true:

1. `docs/security/storage-access-baseline.md` is updated with implementation
   receipts, final callsite counts by risk tier, and signed URL TTL values.
2. Current tenant-prefixed Storage paths have authenticated-client RLS policies
   for `claim-evidence` and `policies` using the join mechanism confirmed in
   step 0.
3. Legacy authenticated-user policies are either retired after a zero-object
   preflight or explicitly retained with a migration plan and a non-passing
   stop record.
4. Direct service-role Storage use is centralized or guarded with no unreviewed
   direct callsites left; each allowlist entry names the responsible owner and
   a follow-up ticket.
5. Cross-tenant path forgery, legacy path injection, and mass-export-style helper
   misuse are covered by focused negative tests.
6. Traversal, empty-segment, and sibling-prefix path inputs are explicitly tested
   against the RLS policy predicate or the app-layer boundary, whichever is the
   enforcing layer.
7. The implementation records that service-role key compromise is not solved by
   RLS, that signed URL lifetime/logging constraints are documented, and that both
   classes remain open platform/secrets controls if the program wants to eliminate
   them.

## Open Questions and Pre-SEC06 Blockers

These must be answered before SEC06 implementation begins. Each is a potential
blocker if unresolved.

| #   | Question                                                                                                                                                                               | Status                             | Blocking?                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | What is the exact table name and column for the `auth.uid()` → `tenantId` join? Can it be referenced directly in a Storage RLS policy, or does it require a `SECURITY DEFINER` helper? | Open                               | Yes — RLS migration cannot be written until resolved.                                                      |
| 2   | Are any of the 13 service-role Storage callsites used in paths that also reach client components or edge functions?                                                                    | Open                               | Yes — determines boundary placement and whether a client-bundle check is needed.                           |
| 3   | Does the repo currently have any objects under the legacy `pii/claims/` or `pii/policies/` path shapes in any environment (prod, staging, preview)?                                    | Open                               | Yes — determines whether legacy policy retirement is safe in SEC06 or requires a separate migration slice. |
| 4   | What are the current signed URL TTLs in use across the 13 callsites?                                                                                                                   | Open                               | No — but must be documented in SEC06 receipt; no implementation gate.                                      |
| 5   | Is `CSP_NONCE_MODE=enforce` expected to be fixed before or after SEC06?                                                                                                                | Open — CSP paused by architecture. | No — but SEC06 must record that signed URL exfiltration via XSS is unmitigated until CSP is enforced.      |

## Rejected Alternatives

| Alternative                                                                  | Decision | Reason                                                                                                                      |
| ---------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Add only Storage RLS policies and leave service-role Storage calls unchanged | Reject   | Service-role Storage calls bypass RLS, so this would not protect the app's highest-risk paths.                              |
| Only add wrapper assertions and skip Storage RLS                             | Reject   | This would keep direct authenticated Storage clients without a database-enforced path backstop.                             |
| Encode tenant ID into a new Supabase JWT claim in SEC06                      | Reject   | This reopens auth/session architecture and is not required because policies can join `auth.uid()` to existing user tenancy. |
| Rewrite all uploads/downloads to fully user-scoped Supabase clients          | Reject   | Too broad for the first backstop slice; it needs separate auth/session and browser-flow design.                             |
| Use bucket-level public/private settings as the isolation mechanism          | Reject   | Both buckets are already private; object-level tenant isolation still needs policy and server-boundary proof.               |
| Broaden DG08 into storage product UX or document-management redesign         | Reject   | No product UX gap is being promoted; this is a security isolation slice.                                                    |

## Verification Plan

DG08 is a design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

SEC06 is an implementation slice and must additionally run focused tests for the
new Storage boundary, SQL/policy proof, the mandatory implementation reviewer
pool, diff-scoped Codex Security scan, and `pnpm verify-slice -- --required-gates`.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, and Stripe remain untouched.
- Storage policy migrations are limited to the current Storage buckets and
  `storage.objects` policy predicates.
