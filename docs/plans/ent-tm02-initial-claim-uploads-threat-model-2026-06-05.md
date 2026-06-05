---
plan_role: input
status: active
source_of_truth: false
owner: claims
last_reviewed: 2026-06-05
superseded_by:
---

# ENT-TM02 Initial Claim Uploads Threat Model - 2026-06-05

> Status: Input document. This record applies the `ENT-TM01` contract to the initial
> claim-wizard upload surface only. It does not change runtime behavior or claim full enterprise
> threat-model completion.

## Identity

- Surface: Initial claim-wizard uploads.
- Owner: Claims intake and upload safety.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/uploads/route.ts`,
  `apps/web/src/app/api/uploads/_core.ts`,
  `apps/web/src/features/claims/upload/server/initial-claim-upload.ts`.
- Proof files: `apps/web/src/app/api/uploads/route.test.ts`,
  `apps/web/src/features/claims/upload/server/initial-claim-upload.test.ts`,
  `apps/web/src/actions/claims/submit.test.ts`,
  `packages/domain-claims/src/claims/submit.test.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-05.

## Data And Assets

- Protected data: uploaded evidence file metadata, MIME type, file size, storage path, upload id,
  tenant id, actor id, optional claim id, and signed upload URL response.
- Durable records: initial claim submission records and evidence metadata created only after
  server-issued upload-intent and stored-object validation pass.
- Storage objects: PII-classified evidence objects under tenant/actor scoped storage paths.
- External systems: Supabase Storage service-role signed upload URL creation.
- Audit or provenance records: actor, tenant, storage path, and upload-intent metadata cited by
  submission validation tests; dedicated upload audit-event modeling remains a residual gap.
- Explicit non-data: this record does not include file contents, claim narratives, raw PII, or
  production secrets.

## Actors And Trust Boundaries

- Trusted actors: authenticated sessions with a valid tenant context; claim-bound uploads are
  further limited to the member owner or assigned agent.
- Untrusted actors: unauthenticated callers, sessions without tenant context, wrong-tenant users,
  unassigned agents for claim-bound uploads, forged clients, oversized-file clients, and clients
  attempting metadata/path substitution.
- External boundary: browser to Next.js route, Next.js server to Supabase Storage, upload URL holder
  to storage object, claim submission to stored-object confirmation.
- Tenant boundary: `ensureTenantId(session)`, tenant-scoped optional claim lookup, tenant-leading
  storage path assertion, and tenant-bound upload-intent verification.

## Existing Controls

- Authentication and authorization controls: route rate-limits before session work, returns `401`
  for missing sessions, and authorizes optional claim uploads by member owner or assigned agent.
- Tenant-scoping controls: `ensureTenantId(session)`, tenant-scoped claim lookup, and tenant-leading
  storage path assertion.
- Input validation and rate limits: schema requires non-empty file name/type and positive size;
  allowed types are JPEG, PNG, PDF, and plain text; files over 10 MiB return `413`.
- Storage or persistence controls: server-generated paths, `assertEvidenceStoragePath`, signed
  upload URL creation, HMAC upload-intent token, and stored-object validation before metadata
  acceptance.
- Audit, telemetry, or evidence controls: focused route, initial-upload, action, and domain tests
  prove the current control boundaries.

## STRIDE Threat Table

| Category               | Threat                                                      | Existing control                                                       | Residual risk                                      | Follow-up or owner                   |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Spoofing               | Unauthenticated or wrong actor requests upload credentials. | Rate limit, session check, tenant resolution, optional claim access.   | Session theft remains an account-security concern. | Auth/incident drills lane.           |
| Tampering              | Client swaps path, file id, MIME type, size, or tenant.     | Server path generation, HMAC intent token, stored-object validation.   | Storage provider metadata trust remains external.  | Claims owner; provider config proof. |
| Repudiation            | Actor denies requesting or submitting upload metadata.      | Actor id and tenant are bound into path/intent and claim submission.   | Dedicated upload audit event is not modeled here.  | Future audit/event lane.             |
| Information disclosure | Signed URL or path leaks tenant evidence location.          | Tenant path assertion, bounded response headers, no raw file logging.  | URL holder can upload during token lifetime.       | Claims owner; short TTL retained.    |
| Denial of service      | Caller floods signing endpoint or uploads oversized files.  | Rate limit, 10 MiB limit, MIME allowlist before URL creation.          | Storage-level bandwidth abuse needs provider caps. | Ops/alert-routing lane.              |
| Elevation of privilege | Unassigned agent or wrong-tenant user attaches evidence.    | Tenant-scoped claim lookup, owner/assigned-agent authorization, token. | Initial unassigned flow depends on session tenant. | Claims owner; auth boundary tests.   |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in focused upload and claim-submission tests listed in
  the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to initial uploads, cites current
  evidence, and avoids claiming runtime enforcement beyond existing tests.

## Result

- Decision: pass for the initial claim-wizard upload threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: upload audit-event modeling, provider-level storage abuse caps, and exercised
  account-compromise response remain outside this surface record.
- Accepted residual risks: short-lived signed upload URLs remain bearer capabilities by design.
- Follow-up slice: `ENT-TM03 Authenticated Claim Evidence Uploads Threat Model`.
- Owner sign-off: platform/claims review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the first surface model required by `ENT-TM01`. The broader threat-model lane
still requires per-surface records for authenticated evidence uploads, documents, share packs,
Paddle webhooks, AI review, registration, and other promoted sensitive surfaces.
