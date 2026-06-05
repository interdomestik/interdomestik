---
plan_role: input
status: active
source_of_truth: false
owner: claims
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM03 Authenticated Claim Evidence Uploads Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to authenticated
> claim evidence uploads only. It does not change runtime behavior or claim full enterprise
> threat-model completion.

## Identity

- Surface: Authenticated claim evidence uploads.
- Owner: Claims operations and evidence custody.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/claims/evidence-upload/route.ts`,
  `apps/web/src/app/api/claims/evidence-upload/_core.ts`,
  `apps/web/src/features/claims/upload/server/shared-upload.ts`,
  `apps/web/src/features/member/claims/actions.ts`,
  `apps/web/src/features/admin/claims/actions/evidence-upload.ts`.
- Proof files: `apps/web/src/app/api/claims/evidence-upload/route.test.ts`,
  `apps/web/src/features/member/claims/actions.test.ts`,
  `apps/web/src/features/admin/claims/actions/evidence-upload.test.ts`,
  `apps/web/src/features/claims/upload/server/access.test.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: claim-bound evidence metadata, legal/evidence category, MIME type, storage
  content type, file size, storage path, file id, tenant id, actor id, claim id, and signed upload
  URL or direct multipart upload response.
- Durable records: `claim_documents` rows and queued claim-document AI workflow records created
  after claim access, upload-intent, path, and stored-object validation.
- Storage objects: PII-classified claim evidence objects under tenant/claim scoped assigned paths.
- External systems: Supabase Storage service-role upload/list/signed-URL operations and Sentry
  warning telemetry for metadata-confirmation failure after direct storage upload.
- Audit or provenance records: uploaded actor, tenant, claim, bucket, path, category, document id,
  and AI workflow queue metadata cited by focused action and route tests.
- Explicit non-data: this record does not include file contents, claim narratives, raw PII,
  payment data, production secrets, or signed URL values.

## Actors And Trust Boundaries

- Trusted actors: authenticated member owners; full-tenant admin roles; branch managers scoped to
  their branch; staff scoped to branch or assignment according to current access helpers.
- Untrusted actors: unauthenticated callers, missing-tenant sessions, wrong-tenant users, members
  uploading to claims they do not own, staff or branch managers outside claim scope, forged clients,
  oversized-file clients, and clients attempting metadata/path substitution.
- External systems: browser clients, Next.js route/server actions, Supabase Storage, Sentry, and
  asynchronous AI workflow dispatch.
- Trust boundaries: browser to route/server action, server to storage service role, signed URL
  holder to storage object, direct multipart upload to metadata confirmation, and persisted
  document metadata to AI workflow queue.
- Tenant isolation boundary: `ensureTenantId(session)`, host-to-tenant check for admin upload
  actions, tenant-scoped claim lookup, tenant-leading assigned storage path assertion, and
  tenant-bound upload-intent verification.

## Existing Controls

- Authentication and authorization controls: route and server actions require session; member
  uploads require owned-claim lookup; admin actions require upload role plus host tenant match;
  staff and branch-manager access is constrained by branch and assignment.
- Tenant-scoping controls: claim lookups include tenant id, storage helpers receive tenant id, and
  assigned storage paths must match `pii/tenants/<tenant>/claims/<claim>/<fileId>.<ext>`.
- Input validation and rate limits: direct route parses multipart form, requires valid locale,
  category, claim id, and file; shared upload helpers reject non-positive or over-50 MiB files and
  unsafe file names before storage writes or signed URL creation.
- Storage or persistence controls: generated file ids, HMAC upload-intent tokens, safe storage path
  assertions, bucket mismatch checks, stored-object size/content-type verification, transactional
  `claim_documents` insert, and post-persistence AI queueing.
- Audit, telemetry, or evidence controls: focused tests prove claim access denial before storage,
  forged metadata rejection before persistence, object metadata mismatch rejection, orphan-upload
  Sentry telemetry, and AI queue failure tolerance after metadata persistence.
- Current proof files: route, member action, admin action, access-helper, and ownership map files
  listed in the identity section.

## STRIDE Threat Table

| Category               | Threat                                                          | Existing control                                                                | Residual risk                                                    | Follow-up or owner                      |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Spoofing               | Wrong actor obtains upload credentials or confirms metadata.    | Session check, role/host checks, member ownership, branch/assignment access.    | Session theft remains outside this surface record.               | Auth/incident drills lane.              |
| Tampering              | Client swaps file id, path, bucket, size, MIME, or category.    | HMAC intent token, bucket checks, assigned path assertion, stored-object check. | Storage provider metadata remains an external trust dependency.  | Claims owner; provider config proof.    |
| Repudiation            | Actor denies direct upload or signed-upload confirmation.       | Actor id, tenant, claim, path, bucket, and document id are persisted or queued. | Dedicated immutable upload audit event is not modeled here.      | Future audit/event lane.                |
| Information disclosure | Signed URL, storage path, or document metadata leaks evidence.  | Tenant-leading paths, redacted signed-URL errors, scoped claim access.          | Signed URLs remain bearer capabilities during their lifetime.    | Claims owner; short TTL retained.       |
| Denial of service      | Caller uploads oversized files or floods storage/AI queues.     | 50 MiB limit, validation before persistence, bounded signed-URL retry behavior. | Provider bandwidth and queue-volume caps need operational proof. | Ops/alert-routing/performance lanes.    |
| Elevation of privilege | Member/staff/branch manager attaches evidence to another claim. | Tenant-scoped ownership/access helpers and host tenant match for admin actions. | Full-tenant admin roles retain broad claim upload authority.     | Claims/platform owner accepted by role. |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in focused upload, access, action, and route tests listed
  in the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to authenticated evidence
  uploads, accurately distinguishes direct and signed-upload flows, and avoids claiming runtime
  enforcement beyond existing tests.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register only.

## Result

- Decision: pass for the authenticated claim evidence upload threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: immutable upload audit-event modeling, provider-level bandwidth/object-abuse
  caps, queue-volume operational proof, and exercised account-compromise response remain outside
  this surface record.
- Accepted residual risks: short-lived signed upload URLs remain bearer capabilities by design, and
  full-tenant admin upload authority remains role-authorized by current access policy.
- Follow-up slice: `ENT-TM04 Document Signed URLs And Downloads Threat Model`.
- Owner sign-off: platform/claims review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the second upload-custody surface required by `ENT-TM01`. The broader
threat-model lane still requires per-surface records for document signed URLs and downloads, share
packs, Paddle webhooks, AI review, registration, admin verification, and other promoted sensitive
surfaces.
