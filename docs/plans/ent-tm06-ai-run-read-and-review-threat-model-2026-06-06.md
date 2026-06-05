---
plan_role: input
status: active
source_of_truth: false
owner: ai-platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM06 AI Run Read And Review Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to AI run reads
> and human review submissions only. It does not change runtime behavior or claim full
> enterprise threat-model completion.

## Identity

- Surface: AI run status reads and privileged human review submissions.
- Owner: AI workflow review and provenance.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/ai/runs/[id]/route.ts`,
  `apps/web/src/app/api/ai/reviews/[id]/route.ts`,
  `apps/web/src/app/api/ai/reviews/[id]/_core.ts`,
  `packages/domain-ai/src/read-models/get-run.ts`.
- Proof files: `apps/web/src/app/api/ai/runs/[id]/route.test.ts`,
  `apps/web/src/app/api/ai/reviews/[id]/route.test.ts`,
  `apps/web/src/app/api/ai/reviews/[id]/_core.test.ts`,
  `packages/domain-ai/src/read-models/get-run.test.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Related evidence: `docs/plans/2026-03-08-ai04-run-status-review-evidence.md`,
  `docs/plans/2026-05-13-p37-ai-production-readiness-closeout.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: AI run ids, workflow names, run status, workflow state, review status, warnings,
  extraction JSON, error codes/messages, requester user ids, reviewer ids, timestamps, policy ids,
  document ids, claim or policy entity links, and corrected extraction payloads.
- Durable records: `ai_runs`, `document_extractions`, and policy rows updated by corrected
  policy-extraction reviews.
- Storage objects or external systems: the read/review surface does not stream storage objects or
  call model providers directly; it exposes and updates persisted AI workflow output.
- Audit or provenance records: AI run review fields (`reviewStatus`, `reviewedBy`, `outputJson`),
  document extraction review fields, timestamps, and existing CI/eval evidence for AI readiness.
- Explicit non-data: this record does not include raw uploaded documents, claim narratives,
  production prompts, provider credentials, API keys, model responses outside persisted schemas,
  or private reviewer notes beyond persisted review state.

## Actors And Trust Boundaries

- Trusted actors: authenticated members reading their own AI runs, staff-or-higher reviewers
  submitting approve/reject/correct actions, and server-side route/core/read-model code.
- Untrusted actors: unauthenticated callers, sessions without tenant identity, members reading
  another user's run, non-privileged review callers, malformed review payloads, wrong-tenant run ids,
  and corrected extraction payloads that do not satisfy workflow schemas.
- External systems: browser clients, Next.js route handlers, database persistence, shared auth,
  rate limiting, AI domain schemas, and CI/eval gates.
- Trust boundaries: browser to AI run read route, browser to AI review route, route to review core,
  read model to database, correction payload to workflow schema parser, and persisted AI output to
  member or staff UI consumers.
- Tenant isolation boundary: both routes resolve tenant identity at the route boundary through
  `resolveTenantBoundary`; run reads use `getAiRun` with tenant-scoped `ai_runs` lookup; review
  submissions update `ai_runs`, `document_extractions`, and policy rows with tenant id predicates.

## Existing Controls

- Authentication and authorization controls: both routes require session and tenant identity; run
  reads allow privileged roles or the requesting member only; review submissions require admin or
  staff-or-higher role before core execution.
- Tenant-scoping controls: run reads use `withTenant` on `ai_runs.tenant_id`; review lookup and
  updates include `ai_runs.tenant_id`, `document_extractions.tenant_id`, and `policies.tenant_id`
  predicates where applicable.
- Input validation and rate limits: read route enforces a production-sensitive 60/minute limit
  before session work; review route enforces a production-sensitive 15/minute limit before session
  work; review action is allowlisted to `approve`, `reject`, or `correct`; corrected payloads are
  parsed with workflow-specific schemas when available.
- Storage or persistence controls: review writes run inside a transaction; corrected policy
  extraction updates synchronize the policy row only for the matching tenant; extraction updates
  preserve the expected prior extraction review status.
- Audit, telemetry, or evidence controls: persisted review fields preserve reviewer identity and
  final review status; focused tests prove unauthenticated denial, missing-tenant denial,
  non-privileged review denial, member non-owner run denial, rate-limit short-circuiting,
  tenant-scoped reads, tenant-scoped review updates, and correction payload submission.
- Current proof files: route, core, read-model, tests, ownership-map, and AI-readiness evidence
  files listed in this record.

## STRIDE Threat Table

| Category               | Threat                                                        | Existing control                                                         | Residual risk                                                       | Follow-up or owner                   |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------ |
| Spoofing               | Caller reads or reviews a run with no tenant-bound identity.  | Session, `resolveTenantBoundary`, privileged role, and owner checks.     | Stolen staff sessions can still approve or correct AI output.       | Auth/incident drills lane.           |
| Tampering              | Reviewer submits malformed or cross-tenant correction output. | Action allowlist, workflow schema parsing, tenant-scoped tx updates.     | Schemas prove structure, not business accuracy of corrected values. | AI platform owner follow-up.         |
| Repudiation            | Reviewer denies approving, rejecting, or correcting output.   | Review writes persist `reviewedBy` and final review status.              | No dedicated immutable audit event is modeled for review actions.   | Audit/event lane.                    |
| Information disclosure | Member or staff sees another tenant/user AI output.           | Tenant-scoped read model and member-owner check for non-privileged read. | Extraction JSON can contain sensitive derived facts if overexposed. | AI/data-lifecycle owner follow-up.   |
| Denial of service      | Polling or review submissions pressure DB and review queues.  | Rate limits run before session/body parsing; malformed actions fail.     | AI route alerting and abuse dashboards are not proven here.         | Alert-routing/performance lanes.     |
| Elevation of privilege | Member or low-privilege user submits a human review decision. | Review route blocks non-privileged roles before `submitAiReview`.        | Role policy depends on shared-auth role classification correctness. | Shared-auth/platform owner accepted. |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in the route, core, and read-model tests listed in the
  identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to AI run reads and human review
  submissions, accurately separates read authorization from review authorization, and avoids
  claiming model-provider, prompt, or AI-generation controls beyond existing evidence.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register only.

## Result

- Decision: pass for the AI run read and review threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: immutable review audit events, alert routing, abuse dashboards, correction
  payload semantic-validity review, unknown workflow correction schema parity, extraction redaction
  review, and staff-session compromise drills remain outside this record.
- Accepted residual risks: privileged roles can read AI output and submit review decisions by
  current policy, and member reads intentionally expose their own persisted AI extraction state.
- Follow-up slice: `ENT-TM07 Paddle Billing Webhooks Threat Model`.
- Owner sign-off: platform/AI review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the AI run read and human review surface required by `ENT-TM01`. The broader
threat-model lane still requires per-surface records for Paddle webhooks, registration, admin
verification, and other promoted sensitive surfaces.
