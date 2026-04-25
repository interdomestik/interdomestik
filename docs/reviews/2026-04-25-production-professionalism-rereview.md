# 2026-04-25 Production Professionalism Re-Review

## Executive summary

This re-review inspected the merged `P15` hardening line after PRs `#508`, `#510`, and `#511`, then looked for adjacent instances of the same failure classes. The original five security/correctness findings are closed on the inspected code paths. The repo now looks materially more professional for a bounded pilot: authz is explicit on assisted registration, protected-route session uncertainty fails closed, share-pack token signing no longer has a production predictable fallback, claim-detail uploads are bound to signed upload intents plus storage-object validation, and member-activity reads are tenant and assignment scoped.

No new launch blocker was found for the bounded pilot. One important non-blocking issue remains: the older claim-wizard evidence upload path still relies on client-submitted evidence metadata during final claim submission rather than the newer server-issued upload-intent confirmation model. It is tenant/user-prefix constrained, but it can persist non-existent or metadata-spoofed evidence and create downstream AI/document workflow noise.

Final pilot readiness posture: **Go for bounded pilot now that this review slice's required gates and PR checks are green; not a broad-production Go.**

## What looks professional

- Assisted registration now has explicit actor authorization. `apps/web/src/app/api/register/route.ts` rate-limits before session work, requires a session, restricts the actor to `ROLE_AGENT`, verifies host/session tenant agreement, and passes tenant plus actor attribution into `registerUserApiCore`.
- Protected canonical routes now fail closed on uncertain session state. `apps/web/src/lib/proxy-logic.ts` redirects protected requests when introspection is missing, errored, throttled, or still `unknown` after the narrow retry path.
- Share-pack bearer tokens now fail fast in production if neither `SHARE_PACK_SECRET` nor `BETTER_AUTH_SECRET` is configured. The local-only fallback is runtime random, not a committed literal.
- Authenticated claim-detail uploads now share a professional server boundary in `apps/web/src/features/claims/upload/server/shared-upload.ts`: HMAC upload intents, generated file IDs, tenant/claim/user binding, safe path shape, storage object existence checks, size checks, content-type checks, and transactional persistence.
- Member-activity reads in `packages/domain-activities/src/get-member.ts` are no longer `memberId`-only. Reads require a tenant session, verify the member belongs to the tenant, and require agent ownership or active assignment for agent callers.
- CI/release posture is stronger than before `P15-QA01`: `pr:verify`, `security:guard`, `e2e:gate`, E2E contract checks, production lint-warning gating, RLS tests, coverage gate, Sonar, finalizer, and pilot-gate evidence are represented in scripts and tracker proof.

## What does not yet meet professional standard

- The claim wizard still has a legacy upload path at `apps/web/src/app/api/uploads/_core.ts` plus `apps/web/src/components/claims/wizard-step-evidence.tsx`. It creates a signed upload URL and later trusts client-submitted `path`, `type`, `size`, `bucket`, and `classification` during `submitClaimCore`. `packages/domain-claims/src/claims/submit.ts` validates bucket, user/tenant path prefix, size, and MIME type, but it does not verify a server-issued upload intent or storage-object existence before persisting claim documents.
- Some API route entrypoints still pass optional `session.user.tenantId` into cores instead of using `ensureTenantId` at the route boundary. Examples include AI run/review routes and notification settings. The cores often fail safely, but the route layer is inconsistent and can turn data-integrity defects into 500s instead of explicit 400/401 responses.
- The current program/tracker are very large single Markdown tables. They are useful as an audit ledger, but change review is brittle because one-line table rows carry enormous evidence payloads.
- The repo has strong gates, but the mandatory local gate bundle is expensive and depends on a healthy local DB/browser stack. That is acceptable for pilot rigor, but it raises contributor friction and makes quick hotfix cadence harder.

## Security / correctness risks

### Launch blockers

None found in this re-review.

### Important but non-blocking

1. **Legacy claim-wizard evidence upload metadata is not server-bound.** The newer claim-detail upload flow fixed this class with signed intents and object verification, but `/api/uploads` plus `submitClaimCore` have not been migrated. Likely failure mode: fake or stale evidence rows, failed document downloads, failed AI extraction jobs, and staff trust erosion when a member submits a claim with evidence metadata that never existed in storage.
2. **Tenant-required route behavior is inconsistent.** Several routes rely on downstream cores to reject missing tenant IDs instead of normalizing the session boundary once. Likely failure mode: noisy 500s, harder incident triage, and inconsistent API contracts when identity data is malformed.
3. **Push subscription upsert can return success after a cross-user endpoint collision without inserting or updating a row.** `apps/web/src/app/api/settings/push/_core.ts` first checks endpoint globally, then updates only when endpoint, tenant, and user all match. If the endpoint exists for another user, the scoped update affects zero rows and still returns success.

### Polish / maturity improvements

- Add a short owner map for sensitive routes: registration, uploads, documents, share packs, AI review, billing, and verification.
- Add route-level `ensureTenantId` consistency tests for API handlers that call tenant-scoped cores.
- Split the tracker proof ledger into smaller generated or appended artifacts once the pilot line is stable.

## Testing / CI assessment

Focused local checks passed during this review:

- `pnpm --filter @interdomestik/web test:unit --run src/app/api/register/route.test.ts src/app/api/register/_core.test.ts src/lib/proxy-logic.test.ts src/features/share-pack/share-pack.service.test.ts src/features/member/claims/actions.test.ts src/features/admin/claims/actions/evidence-upload.test.ts src/app/api/claims/evidence-upload/route.test.ts src/app/api/uploads/route.test.ts` -> 8 files, 71 tests passed.
- `pnpm --filter @interdomestik/domain-activities test:unit --run src/get-member.test.ts` -> 1 file, 6 tests passed.

Test gaps that should exist:

- A claim-wizard submit test that proves a forged file path under the caller's tenant/user prefix is rejected unless bound to a server-issued upload intent.
- A claim-wizard submit test that proves storage-object existence, size, and content type are validated before claim document persistence.
- API route tests that assert missing `tenantId` returns an explicit client/server contract response rather than leaking as a generic 500 for AI run/review and settings routes.
- Push-subscription tests for endpoint collisions across users/tenants.

## Architecture assessment

The architecture is now professional enough for bounded pilot use. The strongest pattern is the separation between app route/server-action entrypoints, domain packages, shared auth/session helpers, database tenant-security helpers, and deterministic gates. The `P15` fixes moved sensitive work toward explicit boundaries instead of relying on proxy protection or RLS alone.

The main architectural risk is uneven migration from older app-layer patterns to the newer intent-bound, tenant-explicit core patterns. The codebase has both styles at once: claim-detail uploads are strongly bound and verified, while initial claim-wizard uploads still use a weaker signed-upload-plus-client-metadata model. If that pattern remains, future engineers are likely to copy the weaker path into new workflows because it is simpler and already public.

## Top 10 actions to reach professional standard

1. Migrate `/api/uploads` and claim-wizard evidence submission onto the shared upload-intent/object-validation path used by claim-detail uploads.
2. Add object-existence, MIME, size, and generated-file-id validation before `submitClaimCore` persists initial claim evidence.
3. Normalize all tenant-scoped API route handlers to call `ensureTenantId` at the boundary and return explicit contract errors for missing tenant identity.
4. Fix push-subscription endpoint collision handling so cross-user existing endpoints either insert a scoped row or return a clear conflict/error.
5. Add negative tests for forged claim-wizard evidence metadata and missing storage objects.
6. Add route-level tests for missing tenant IDs on AI run/review and notification/settings APIs.
7. Keep `apps/web/src/proxy.ts` read-only, but maintain proxy-logic tests for every protected-route fail-closed mode.
8. Keep Sonar/Copilot/finalizer feedback as mandatory must-fix input before merge.
9. Move oversized tracker evidence into smaller linked artifacts after the pilot so review diffs remain readable.
10. Maintain a sensitive-route ownership map so registration, uploads, documents, share packs, AI, billing, and verification have named security expectations.

## Final score

**8.0 / 10 production professionalism for bounded pilot.**

The repo is no longer blocked by the original five findings, and the verification posture is stronger than typical early pilot software. It is not yet a 9+ because legacy upload semantics, route-boundary inconsistency, and tracker maintainability still create avoidable operational risk.

## Go / No-Go

**Go for bounded pilot** now that this `P16-PR01` slice's required gates and PR checks are green.

**No-Go for broad production expansion** until the legacy claim-wizard upload path is migrated to the same server-bound upload-intent confirmation model as the claim-detail upload path.
