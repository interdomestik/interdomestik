---
plan_role: input
status: active
source_of_truth: false
owner: documents
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM05 Share Packs Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to share-pack
> creation and bearer-token access only. It does not change runtime behavior or claim full
> enterprise threat-model completion.

## Identity

- Surface: share packs for document bundle creation and bearer-token retrieval.
- Owner: document sharing and bearer-token safety.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/share-pack/route.ts`,
  `apps/web/src/app/api/share-pack/_core.ts`,
  `apps/web/src/features/share-pack/share-pack.service.ts`,
  `packages/database/src/schema/documents.ts`.
- Proof files: `apps/web/src/app/api/share-pack/route.test.ts`,
  `apps/web/src/app/api/share-pack/_core.test.ts`,
  `apps/web/src/features/share-pack/share-pack.service.test.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: share-pack ids, document id lists, tenant ids, creator user ids, token expiry,
  revocation state, document metadata returned to token holders, bearer share tokens, IP address,
  and user-agent audit metadata.
- Durable records: `share_packs` rows, `documents` rows referenced by pack document ids, and
  `document_access_log` rows written for share creation and token access.
- Storage objects or external systems: share packs expose document metadata through API responses;
  this surface does not stream storage objects directly.
- Audit or provenance records: document access log rows with `accessType: share`, document id,
  tenant id, optional authenticated accessor, IP address, user agent, and hashed share token.
- Explicit non-data: this record does not include raw document contents, raw signed URL values,
  raw share-token values, claim narratives, payment data, production secrets, or JWT signing
  secrets.

## Actors And Trust Boundaries

- Trusted actors: authenticated users with tenant identity creating share packs for tenant-scoped
  documents, and server-side share-pack services using configured signing secrets.
- Untrusted actors: unauthenticated POST callers, sessions without tenant identity, clients
  submitting wrong-tenant document ids, expired or forged token holders, revoked-pack token
  holders, and anyone receiving or leaking a valid bearer share token.
- External systems: browser clients, unauthenticated token consumers, Next.js route handlers,
  database persistence, JWT signing/verification, and audit logging.
- Trust boundaries: authenticated browser to POST route, unauthenticated token holder to GET route,
  route to share-pack core, share-pack service to database, and JWT bearer token to server-side
  pack state.
- Tenant isolation boundary: POST resolves tenant identity at the route boundary with
  `resolveTenantBoundary`; pack creation validates requested document ids against tenant-scoped
  `documents` rows; GET accepts only tokens whose signed payload resolves pack id and tenant id,
  then rechecks pack existence, tenant id, expiry, revocation, and document tenant id.

## Existing Controls

- Authentication and authorization controls: POST requires an authenticated session and tenant
  identity before share-pack creation; GET is intentionally bearer-token based and requires no
  session.
- Tenant-scoping controls: pack creation accepts only document ids present in the creator's tenant;
  pack lookup includes signed tenant id, stored pack tenant id, and document tenant id checks.
- Input validation and rate limits: POST rejects missing or non-string document id arrays; core
  rejects empty document lists; GET rejects missing tokens and invalid, expired, missing, or revoked
  packs. No per-route rate limit is documented for the current share-pack routes.
- Storage or persistence controls: pack state is persisted server-side with expiry and revocation
  fields; tokens are JWT signed with `SHARE_PACK_SECRET` or `BETTER_AUTH_SECRET`; production
  deployment fails fast if no signing secret is configured; development fallback secret is
  generated at runtime rather than hardcoded.
- Audit, telemetry, or evidence controls: successful creation and token access log per-document
  share audit events; raw share tokens are hashed before storage; focused tests prove
  unauthenticated POST denial, missing-tenant denial, invalid id rejection, token signing and
  verification, production secret fail-fast, and hashed-token audit storage.
- Current proof files: route, core, service, schema, and ownership-map files listed in this record.

## STRIDE Threat Table

| Category               | Threat                                                   | Existing control                                                           | Residual risk                                                          | Follow-up or owner                     |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| Spoofing               | Caller creates a pack without tenant identity.           | POST requires session and `resolveTenantBoundary` success.                 | Account compromise and auth-secret fallback boundary risk remain.      | Auth/incident drills lane.             |
| Tampering              | Client includes wrong-tenant or forged document ids.     | Creation validates ids against tenant-scoped `documents` rows.             | Current proof does not model claim-level access for every document id. | Documents owner; future access review. |
| Repudiation            | Creator or token holder denies creating/accessing pack.  | Per-document share audit rows include tenant, document, actor when known.  | Anonymous bearer access cannot identify a human recipient.             | Documents owner accepted by design.    |
| Information disclosure | Valid token leaks document metadata to unintended party. | Signed token, server-side pack state, expiry, revocation, tenant rechecks. | Bearer tokens remain transferable until expiry or revocation.          | Documents owner; short-lived sharing.  |
| Denial of service      | Repeated pack creation or token reads pressure DB/audit. | Empty/invalid ids are rejected before insert; invalid tokens return 404.   | No route rate-limit proof is documented for share-pack routes.         | Performance/alert-routing lanes.       |
| Elevation of privilege | User shares documents they should not be able to expose. | Tenant-scoped document id validation blocks cross-tenant ids.              | Tenant-level id validation is broader than document-access-core rules. | Documents/platform owner follow-up.    |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in the route, core, service, and schema files listed in
  the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to share packs, accurately
  distinguishes authenticated creation from unauthenticated bearer-token access, and avoids
  claiming document-access-core enforcement where current evidence only proves tenant-scoped id
  validation.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register only.

## Result

- Decision: pass for the share-pack threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: share-pack route rate-limit proof, recipient identity proof, per-document
  access-core parity for pack creation, auth-secret fallback boundary review, alerting, and
  retention cadence remain outside this record.
- Accepted residual risks: share tokens are transferable bearer credentials by design, and
  anonymous token access cannot prove recipient identity.
- Follow-up slice: `ENT-TM06 AI Run Read And Review Threat Model`.
- Owner sign-off: platform/documents review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the share-pack custody surface required by `ENT-TM01`. The broader
threat-model lane still requires per-surface records for AI review, Paddle webhooks, registration,
admin verification, and other promoted sensitive surfaces.
