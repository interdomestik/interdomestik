---
plan_role: input
status: active
source_of_truth: false
owner: admin-verification
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM09 Admin Verification Details Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to the
> admin verification details read path only. It does not change runtime behavior,
> approval/resubmission mutations, document-download authorization, or claim full
> enterprise threat-model completion.

## Identity

- Surface: privileged admin verification payment-attempt details read.
- Owner: admin verification operations.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/verification/[id]/route.ts`,
  `apps/web/src/app/api/verification/[id]/_core.ts`,
  `apps/web/src/features/admin/verification/server/verification.core.ts`,
  `apps/web/src/features/admin/verification/server/queries/get-details.ts`.
- Proof files: `apps/web/src/app/api/verification/[id]/route.test.ts`,
  `apps/web/src/app/api/verification/[id]/_core.test.ts`,
  `apps/web/src/features/admin/verification/server/types.ts`,
  `apps/web/src/features/admin/verification/server/schemas.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: verification attempt id, lead id, lead first and last name, email, payment
  amount, currency, verification status, resubmission flag, branch id/code/name, agent id/name/email,
  verification note, verifier name, document metadata, document download links, and timeline notes.
- Durable records: `lead_payment_attempts`, `member_leads`, `branches`, `documents`, `audit_log`,
  and `user` rows joined as agent, verifier, or audit actor records.
- Storage objects or external systems: document download routes returned as API links; this read path
  does not issue signed storage URLs itself.
- Audit or provenance records: audit-log timeline entries for payment-attempt actions, actor names,
  uploaded proof metadata, and payment-attempt creation provenance.
- Explicit non-data: this record does not include raw document contents, live verification samples,
  production tenant data, claim narratives, payment-card data, credentials, or provider dashboard
  details.

## Actors And Trust Boundaries

- Trusted actors: authenticated sessions with allowed admin verification roles, better-auth session
  state, `resolveTenantBoundary`, pure API core role checks, and tenant-scoped verification query
  code.
- Untrusted actors: unauthenticated callers, member or agent sessions, caller-controlled verification
  ids, stale branch assignments, cross-tenant attempt ids, and unexpected query result shapes.
- External systems: browser or API caller, Next.js route handler, better-auth session API, tenant
  boundary resolver, PostgreSQL persistence, document download API routes, and audit-log storage.
- Trust boundaries: public HTTP request to protected route, route to session lookup, session to tenant
  boundary resolver, resolved session data to pure API core, API core to verification-details query,
  and query DTO to JSON response.
- Tenant isolation boundary: the route rejects missing sessions and missing tenant identity before
  calling the core; the query predicates payment attempts, documents, and audit logs by tenant id;
  staff and branch-manager reads require a session branch id and add member-lead branch filtering.

## Existing Controls

- Authentication and authorization controls: missing session returns `401`; the core allows only
  `admin`, `super_admin`, `tenant_admin`, `branch_manager`, or `staff`; other roles return `403`
  before verification details are read.
- Tenant-scoping controls: the route resolves tenant identity through `resolveTenantBoundary`; the
  query requires `leadPaymentAttempts.tenantId`, `documents.tenantId`, and `auditLog.tenantId` to
  match the resolved tenant; staff and branch managers must also match `memberLeads.branchId`.
- Input validation and rate limits: the route reads the path id and passes it to the pure core; the
  current route does not apply a dedicated rate limiter or non-blank id validation before the query.
- Storage or persistence controls: this surface is read-only; document response items expose
  `/api/documents/{id}/download` links whose download authorization belongs to the document-access
  surface, not this details read.
- Audit, telemetry, or evidence controls: timeline output is derived from tenant-scoped audit-log
  rows and proof upload metadata; unexpected service exceptions are caught in the API core and
  returned as not found rather than leaking raw exception details.
- Current proof files: route, core, query, DTO, schema, route tests, core tests, and ownership-map
  files listed in this record.

## STRIDE Threat Table

| Category               | Threat                                                            | Existing control                                                               | Residual risk                                                                    | Follow-up or owner                 |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------- |
| Spoofing               | Member, agent, or unauthenticated caller reads verification data. | Session required; allowed-role list gates the details query.                   | Compromised privileged session can still read scoped verification details.       | Auth incident response lane.       |
| Tampering              | Caller changes the attempt id to inspect another tenant's case.   | Attempt, document, and audit reads are tenant-scoped; branch roles are scoped. | Blank or malformed ids are not rejected before query construction.               | Admin verification owner accepted. |
| Repudiation            | Actor disputes verification timeline or proof-upload provenance.  | Timeline derives from audit-log rows and uploaded proof metadata.              | This read path does not create immutable audit attestations.                     | Audit/timeline architecture lane.  |
| Information disclosure | Verification PII, notes, or document links leak cross-tenant.     | Tenant predicates and branch filters constrain reads before JSON response.     | Document links depend on separate document-download authorization at click time. | Document custody owner accepted.   |
| Denial of service      | Repeated details reads pressure joined payment, document, logs.   | Missing session and disallowed roles stop before DB work.                      | No details-route-specific rate limit or load budget is recorded.                 | Performance regression gate lane.  |
| Elevation of privilege | Branch-scoped staff views tenant-wide verification details.       | Staff and branch-manager roles require `scope.branchId` and branch predicate.  | Admin and tenant-admin broad visibility is intentionally privileged.             | Admin verification owner accepted. |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in the route, core, query, DTO, schema, and test files
  listed in the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to verification-details reads,
  accurately describes allowed roles and tenant/branch scoping, and avoids claiming mutation,
  document-download, alert-routing, or load-test readiness.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register only.

## Result

- Decision: pass for the admin verification details threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: details-route-specific rate limiting, pre-query id validation, immutable audit
  attestations, live alert-routing exercise proof, and route/storage performance budgets remain
  outside this record.
- Accepted residual risks: privileged admin verification roles intentionally see tenant-scoped
  payment verification details, and document links rely on the separately modeled document-access
  authorization path for content retrieval.
- Follow-up slice: `ENT-ALERT01 Alert Routing Evidence Contract`.
- Owner sign-off: platform/admin-verification review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the admin verification details surface required by `ENT-TM01`. The broader
enterprise-readiness lane still requires operational restore proof, alert-routing exercise proof,
data lifecycle verification, performance regression gates, and future threat models only when new
sensitive delivery trust boundaries are promoted.
