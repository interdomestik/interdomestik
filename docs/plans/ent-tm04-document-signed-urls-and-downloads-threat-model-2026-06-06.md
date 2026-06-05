---
plan_role: input
status: active
source_of_truth: false
owner: documents
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM04 Document Signed URLs And Downloads Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to document signed
> URLs and direct document downloads only. It does not change runtime behavior or claim full
> enterprise threat-model completion.

## Identity

- Surface: document signed URLs and direct document downloads.
- Owner: document custody and claim access.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/documents/[id]/route.ts`,
  `apps/web/src/app/api/documents/[id]/download/route.ts`,
  `apps/web/src/app/api/documents/_core.ts`,
  `apps/web/src/app/api/documents/storage-service.server.ts`.
- Proof files: `apps/web/src/app/api/documents/[id]/route.test.ts`,
  `apps/web/src/app/api/documents/[id]/download/route.test.ts`,
  `apps/web/src/app/api/documents/_core.test.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: document ids, document names, MIME types, file sizes, buckets, tenant-scoped
  storage paths, claim/member/policy entity links, signed download URLs, and streamed document
  bytes.
- Durable records: polymorphic `documents` rows, legacy `claim_documents` rows, related `claims`
  and `policies` rows used for access resolution, and document access audit events.
- Storage objects: PII-classified claim and policy documents under tenant-leading storage prefixes.
- External systems: Supabase Storage service-role signed URL and download operations, browser
  clients holding signed URLs, and Sentry SLO tagging for direct download paths.
- Audit or provenance records: allowed `document.signed_url_issued`, `document.view`, and
  `document.download` events plus forbidden-access audit events.
- Explicit non-data: this record does not include file contents, signed URL values, raw PII, claim
  narratives, payment data, production secrets, or storage provider credentials.

## Actors And Trust Boundaries

- Trusted actors: authenticated member owners, document uploaders where allowed, assigned agents,
  branch-scoped staff and branch managers, and full-tenant claims roles.
- Untrusted actors: unauthenticated callers, wrong-tenant sessions, cross-member callers,
  unassigned agents, staff or branch managers outside claim scope, forged document ids, and leaked
  signed URL holders.
- External systems: browser clients, Next.js route handlers, Supabase Storage, audit logging, and
  Sentry telemetry.
- Trust boundaries: browser to document route, route to shared access core, access core to database,
  service-role server to storage, signed URL bearer to storage, and streamed response to browser.
- Tenant isolation boundary: `ensureTenantId(session)`, tenant-scoped document and legacy document
  reads, tenant-scoped claim/policy checks, bucket-family resolution, and
  `assertTenantStoragePath` before signed URL creation or storage download.

## Existing Controls

- Authentication and authorization controls: routes require session; access core authorizes
  polymorphic member/profile, claim, and policy documents plus legacy claim documents by current
  role, ownership, uploader, branch, assignment, and full-tenant role rules.
- Tenant-scoping controls: document lookups include tenant id, claim and policy reads include tenant
  id, and storage service calls pass tenant id with the resolved `claims` or `policies` storage
  family.
- Input validation and rate limits: both routes enforce a production-sensitive 60/minute rate limit;
  signed URL responses use a fixed five-minute TTL; download disposition is allowlisted to
  `inline` or `attachment`; filenames are sanitized for content-disposition headers.
- Storage or persistence controls: storage helpers assert bucket and `pii/tenants/<tenant>/<family>`
  prefixes before service-role signed URL or download calls; signed URL JSON responses set
  `Cache-Control: private, no-store, max-age=0` and `Referrer-Policy: no-referrer`; direct downloads
  set `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.
- Audit, telemetry, or evidence controls: allowed signed URL, view, download, and forbidden access
  attempts are audited; direct downloads set the `d07.document.download` SLO tag; focused tests
  prove unauthenticated, missing, forbidden, signed URL, stream, inline, and audit behavior.
- Current proof files: route, download route, access core, storage helper, signed URL exposure, and
  ownership map files listed in this record.

## STRIDE Threat Table

| Category               | Threat                                                        | Existing control                                                                 | Residual risk                                                  | Follow-up or owner                  |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| Spoofing               | Wrong actor requests a document URL or stream.                | Session requirement, tenant-bound reads, ownership/role/branch/assignment rules. | Stolen sessions remain outside this surface record.            | Auth/incident drills lane.          |
| Tampering              | Caller manipulates document id, disposition, bucket, or path. | Server-side lookup resolves bucket/path; disposition allowlist; storage asserts. | Legacy rows depend on stored bucket/path integrity.            | Documents owner; audit/event lane.  |
| Repudiation            | Actor denies viewing, downloading, or requesting a URL.       | Allowed and forbidden access audit events include actor, entity, action, path.   | Audit retention and alerting cadence are not proven here.      | Alert-routing/data-lifecycle lanes. |
| Information disclosure | Signed URL, path, headers, or streamed bytes leak documents.  | Short TTL, no-store/no-referrer, access before issuance/download, path asserts.  | Signed URLs are bearer capabilities until expiry.              | Documents owner; TTL accepted.      |
| Denial of service      | Caller repeatedly signs or streams large documents.           | Per-route rate limits and storage-provider error handling.                       | Bandwidth, object-size, and storage egress budgets need proof. | Performance/alert-routing lanes.    |
| Elevation of privilege | Agent/staff/branch manager reads another claim document.      | Claim access helper enforces assignment, branch, or full-tenant role boundaries. | Full-tenant roles retain broad document access by policy.      | Platform/documents owner accepted.  |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in the route, download route, and access-core tests
  listed in the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to document signed URLs and
  downloads, accurately distinguishes signed URL issuance from server-streamed downloads, and
  avoids claiming runtime enforcement beyond existing evidence.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register only.

## Result

- Decision: pass for the document signed URLs and downloads threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: audit retention cadence, bandwidth/egress limits, storage-provider abuse
  alerting, and account-compromise drills remain outside this surface record.
- Accepted residual risks: signed download URLs remain bearer capabilities for a five-minute TTL,
  and full-tenant roles retain broad access by current policy.
- Follow-up slice: `ENT-TM05 Share Packs Threat Model`.
- Owner sign-off: platform/documents review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the first document-access custody surface required by `ENT-TM01`. The broader
threat-model lane still requires per-surface records for share packs, Paddle webhooks, AI review,
registration, admin verification, and other promoted sensitive surfaces.
