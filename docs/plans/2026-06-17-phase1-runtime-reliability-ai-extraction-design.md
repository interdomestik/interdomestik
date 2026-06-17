# Phase 1 Runtime Reliability And AI Extraction Design Gate

Date: 2026-06-17
Status: design-gate
Classification: promotion/design-gate, Tier 0

## 1. Purpose And Current-State Findings

This design gate defines future implementation slices for runtime reliability and
AI extraction hardening. It does not implement runtime behavior and does not
promote `T-302c`.

Current authority snapshot, captured on 2026-06-17:

- Local `main` was clean and synced with `origin/main` before this Phase 1
  design-gate branch was created.
- Phase 0 closeouts are present in PR `#1086`, PR `#1087`, and PR `#1088`.
- `docs/plans/current-program.md`, `docs/plans/current-tracker.md`, and
  `docs/plans/architecture-finalization-tracker-2026-05-29.md` record `T-302b`
  complete and name `T-302c` as the next canonical candidate, subject to a fresh
  current-authority run. This gate does not start it.
- The slice resolver still emitted stale `T-302b` active-slice text even though
  the canonical tracker rows say `T-302b` is done. Treat the tracker/program
  rows as the current authority.

Runtime findings:

- Policy extraction is queued through `apps/web/src/app/api/policies/analyze`.
  It uploads tenant-prefixed storage, writes `policies`, `documents`, and
  `ai_runs`, emits `policy/extract.requested`, downloads via service-role
  storage wrappers, parses PDF text or image fallback, validates
  `policyExtractSchema`, persists `document_extractions`, and leaves review
  status `pending`.
- Claim AI extraction is centered in `apps/web/src/lib/ai/claim-workflows.ts`.
  It joins `ai_runs`, `documents`, and `claims` by tenant, downloads tenant
  storage, parses text/PDF, calls deterministic domain AI extractors, persists
  `document_extractions`, and marks review `pending`.
- Human review state is handled by `apps/web/src/app/api/ai/reviews/[id]`,
  which validates corrected payloads for known workflows, updates `ai_runs` and
  `document_extractions`, and syncs corrected policy outputs back to `policies`.
- `packages/domain-ai` has static model/profile routing. All workflows default
  to `gpt-5.5`; `gpt-5-mini`, `gpt-5-nano`, and `gpt-5.4-pro` exist as profiles
  but are not selected by dynamic complexity or risk inputs.
- Inngest dispatch currently sends one event per queued AI run. Processing
  functions wrap the whole run in one `step.run`; retry and permanent-failure
  semantics are not first-class result contracts.
- CRM forecast backfill has sequential loops over dates and work items, soft
  timeouts, deferred rollups, idempotency keys, and version-conflict handling.
- API request validation varies: share-pack hand-parses JSON, privacy deletion
  has a tolerant body parser, and CRM backfill uses a stricter Zod route schema.
- Golden Loop remains outside the CI critical path. This gate must not
  reintroduce it.

## 2. Phase 2: Shared `withTransientRetry` And Error Classifier

Goal: introduce a small runtime utility for bounded retries and common error
classification before changing AI extraction behavior.

Likely files:

- New utility under `apps/web/src/lib/reliability/`.
- Narrow adapters in `apps/web/src/lib/ai/dispatch-failure.ts`,
  `apps/web/src/lib/ai/claim-workflows.ts`, and
  `apps/web/src/app/api/policies/analyze/_services.ts`.
- Focused tests beside the new utility and touched adapters.

Result contract:

```ts
type RetryErrorKind = 'transient' | 'permanent' | 'auth' | 'quota' | 'validation';

type TransientRetryResult<T> =
  | { ok: true; value: T; attempts: number; elapsedMs: number }
  | {
      ok: false;
      kind: RetryErrorKind;
      attempts: number;
      elapsedMs: number;
      retryable: boolean;
      message: string;
      cause?: unknown;
    };
```

Classifier rules:

- `transient`: network resets, fetch failures, storage 5xx, Inngest temporary
  dispatch errors, database serialization/deadlock, timeout/abort.
- `permanent`: missing queued run, unsupported MIME, missing storage path,
  empty parsed document text, duplicate terminal run state.
- `auth`: tenant storage path mismatch, missing tenant id, service-role storage
  bucket mismatch, unauthorized/forbidden route state.
- `quota`: provider or platform quota, rate-limit exhaustion, 429 with
  `Retry-After`.
- `validation`: Zod/schema parse failure, malformed request JSON after the route
  boundary, invalid corrected extraction payload.

Retry budget rules:

- Default to at most `3` attempts for transient errors and `2` attempts for
  quota errors with `Retry-After` respected when present.
- Never retry `permanent`, `auth`, or `validation` classifications.
- Add per-call max elapsed budget. AI storage/download should default under
  `15s`; dispatch should default under `10s`.
- Log only classification, attempts, elapsed time, run id, workflow, and tenant
  id. Do not log document text, signed URLs, raw provider payloads, claim
  descriptions, or uploaded content.

Inngest dispatch integration plan:

- Wrap `inngest.send` in `withTransientRetry` for policy and claim event emits.
- On retry exhaustion, mark the queued run failed using the existing
  dispatch-failure helper, preserving `policy_extract_dispatch_failed` and
  `claim_ai_dispatch_failed` error codes for compatibility.
- In Inngest processors, classify thrown errors before rethrowing. Transient
  failures may be rethrown so Inngest can retry. Permanent/auth/validation
  failures should update the run terminally and then return a typed failure
  result instead of relying on repeated function retries.

AI storage/download integration plan:

- Wrap `downloadTenantObject` calls in policy and claim AI workflows.
- Treat `TenantStoragePathError` and bucket/tenant mismatch as `auth`, not
  transient.
- Treat missing object after a valid path as `permanent` unless the upload and
  processing event are in the same request path and the object store reports a
  transient 5xx/timeout.

## 3. Phase 3: Model/Resource Router In `packages/domain-ai`

Goal: add an explicit model/resource router while preserving current
`gpt-5.5` defaults when routing inputs are missing or uncertain.

Likely files:

- `packages/domain-ai/src/models.ts`
- New `packages/domain-ai/src/router.ts`
- `packages/domain-ai/src/types.ts`
- `packages/domain-ai/src/telemetry.ts`
- Tests in `packages/domain-ai/src/*.test.ts`

Complexity and risk inputs:

- `workflow`
- document MIME type and parsed text length
- extraction target count and schema version
- claim category, legal-document type, and jurisdiction confidence when known
- user-visible or operational risk level: `low`, `normal`, `high`
- prior parse warnings, prior confidence, and whether corrected human review
  exists for similar workflow/schema inputs

Profiles:

- `cheap`: `gpt-5-nano` or `gpt-5-mini`, routing/classification only, no
  authoritative extraction persistence.
- `default`: current `gpt-5.5`, preserving existing behavior for uncertain,
  missing, or high-risk inputs.
- `escalation`: `gpt-5.4-pro`, manual or policy-approved escalation only.

Escalation rules:

- Low confidence, sparse document text, high warning count, legal/claim risk,
  or schema critique failure must route to `default` or `escalation`.
- Cheap profile may only make control-plane recommendations. Its output cannot
  be persisted as extraction truth without default/escalation confirmation.
- If router input is incomplete, the router must fail closed to `gpt-5.5`.

Telemetry fields:

- `routerVersion`
- `selectedProfile`
- `selectedModel`
- `fallbackReason`
- `complexityScore`
- `riskLevel`
- `confidenceBeforeCritique`
- `confidenceAfterCritique`
- `escalated`
- `routingInputCompleteness`

## 4. Phase 4: AI Extraction Pipeline Split

Goal: split extraction processing into narrow, testable steps:

```text
claimRun -> loadInput -> extract -> critique -> persist
```

The same step shape should cover policy, claim intake, and legal document
extraction without mixing auth, storage, parsing, model routing, schema
validation, critique, and persistence in one large function.

Step result contracts:

- `claimRun`: atomically moves `queued` to `processing`; returns `skipped` for
  already terminal or already claimed runs.
- `loadInput`: returns tenant id, workflow, document metadata, storage buffer,
  parsed text, request metadata, and sanitized content metrics.
- `extract`: returns schema candidate, model/router metadata, warnings, and raw
  confidence. It must not persist.
- `critique`: returns `accepted`, `needs_human_review`, or `failed`, with
  confidence, warning codes, and escalation recommendation.
- `persist`: writes `document_extractions`, `ai_runs`, and workflow-specific
  projections only after schema and critique gates pass.

Critic confidence/warning contract:

```ts
type ExtractionCritique = {
  decision: 'accepted' | 'needs_human_review' | 'failed';
  confidence: number;
  warnings: string[];
  warningCodes: string[];
  escalationRecommended: boolean;
  persistenceAllowed: boolean;
};
```

Schema validation boundary:

- Validate candidate output with the workflow schema before critique.
- Validate corrected human-review payloads with the same schema versions.
- Persist only schema-valid output. Invalid output marks the run failed with
  `validation` classification and keeps raw content out of logs.

Persistence gate:

- `persist` runs only when `persistenceAllowed` is true.
- Low-confidence output may be persisted only as review-required extraction with
  `reviewStatus: 'pending'`, never as approved business fact.
- Existing policy sync behavior must remain correction-only or schema-valid
  extraction-only.

Human review preservation:

- Preserve existing `pending`, `approved`, `rejected`, and `corrected` states.
- Preserve staff/admin-only review route authorization.
- Preserve corrected extraction sync into policy projections.
- Do not overwrite reviewed rows on retry. A retry must skip or append a new
  version only through an explicit schema/version migration design.

Retry/rollback behavior:

- Retrying `loadInput` and `extract` is allowed within Phase 2 retry budgets.
- Once `persist` starts, use a single transaction for run completion and
  extraction row writes.
- If persistence fails transiently, retry the whole persistence transaction.
- If persistence is ambiguous after timeout, re-read by `sourceRunId` before
  writing again.

File-size and modularity plan:

- Do not grow `apps/web/src/app/api/policies/analyze/_services.ts` or
  `apps/web/src/lib/ai/claim-workflows.ts`; they are already over 150 lines.
- Extract small modules such as `load-policy-input.ts`, `load-claim-input.ts`,
  `extract-policy.ts`, `critique-extraction.ts`, and `persist-extraction.ts`.
- Keep new TS files under 150 lines. If a shared transaction helper needs more,
  document why and keep it under the 200-line hard ceiling.

## 5. Phase 5: Reusable API Request Guard Pilot

Goal: pilot a reusable API request guard on `share-pack` plus one privacy route
without changing product behavior.

Likely files:

- New `apps/web/src/app/api/request-guard.ts` or equivalent established API
  helper path.
- `apps/web/src/app/api/share-pack/route.ts`
- `apps/web/src/app/api/privacy/data-deletion/route.ts`
- Focused route/core tests.

`safeJson(schema)`:

- Accept a Zod schema and return `{ ok: true; data }` or a standard
  `400 invalid_json` / `400 invalid_request` response.
- Support tolerant empty-body behavior only when the caller explicitly opts in.
- Never expose raw Zod issue details on sensitive routes by default.

Rate-limit wrapper compatibility:

- Compose with existing `enforceRateLimit`.
- Preserve existing `Retry-After` handling and production fail-closed behavior.
- Do not move authorization behind body parsing when the current route checks
  auth first for sensitive endpoints.

Client metadata normalization:

- Normalize IP from `x-forwarded-for` first hop or `x-real-ip`.
- Normalize user agent by trimming and bounding length.
- Expose `clientMetadata` to cores as optional structured data.

Standard error mapping:

- Map shared core `ApiResult` codes to HTTP status consistently.
- Preserve route-specific public error text where E2E or clients depend on it.
- Keep privacy deletion's `202 alreadyPending` semantics unchanged.

Pilot migration plan:

- Migrate `POST /api/share-pack` first because it currently hand-parses
  `documentIds`.
- Migrate `POST /api/privacy/data-deletion` second because it already has a
  small body shape and metadata normalization.
- Keep `GET /api/share-pack` token handling out of the first pilot unless tests
  show the helper covers query-parameter validation cleanly.

## 6. Phase 6: CRM Forecast Backfill Bounded Concurrency

Goal: replace per-date work-item serial processing with bounded concurrency
while preserving idempotency, soft timeouts, deferred behavior, and result
rollup shape.

Likely files:

- `apps/web/src/app/api/cron/crm/forecast-snapshots/backfill/_core.ts`
- Existing backfill tests and PII tests.

Bounded worker pool design:

- Keep dates sequential for predictable result ordering and existing deferred
  date behavior.
- Process work items for a single date through a worker pool with a default
  concurrency of `2` or `3`, configurable only through internal args.
- Use an abort signal shared across the date when the target-duration budget is
  exhausted.
- Preserve stable result ordering by recording each work-item outcome by source
  index, then rolling up after the pool drains or aborts.

Idempotency preservation:

- Keep current idempotency key inputs: work item, snapshot date, and
  `sourceRunId`.
- Preserve version-conflict classification.
- Re-read or rely on existing repository conflict behavior before counting a
  retried insertion as failure.

Timeout/deferred behavior:

- When target duration expires, stop scheduling new work and mark unscheduled
  items deferred.
- When a worker hits soft timeout, abort remaining in-flight work where safe,
  stop scheduling, and mark not-started work deferred.
- Do not count aborted, never-started items as failed.

Result rollup compatibility:

- Preserve `CrmForecastSnapshotBackfillResult` and
  `CrmForecastSnapshotBackfillDateResult` shapes.
- Preserve `completed`, `dry_run`, `partial`, `failed`, and `deferred` status
  meanings.
- Preserve PII-key assertions against the final result.

## 7. Deferred: Release-Gate Parallelization

Release-gate parallelization is deferred because this Phase 1 gate is about
runtime reliability and AI extraction design, not release infrastructure. It is
also currently a poor first implementation target: high/critical CodeQL alerts
overlap `scripts/release-gate/run.ts`, `scripts/release-gate/session-navigation.ts`,
and release-gate tests. Parallelizing that surface before alert triage would mix
performance/concurrency work with security remediation and make review scope too
broad.

Future release-gate work should start with a separate design gate that first
classifies and remediates or accepts the overlapping CodeQL findings, then
defines safe parallel execution boundaries.

## 8. Security Backlog Interaction

Known GitHub security snapshot on 2026-06-17, included for gate context only.
The GitHub Security tab remains the live source for current alert counts:

- Dependabot: 4 open alerts: 1 critical development-scope alert, 1 medium
  runtime alert, and 2 low runtime alerts.
- CodeQL: 93 open alerts: 10 critical, 53 high, and 30 medium.
- Secret scanning: 0 open alerts.

Overlap assessment:

- Planned Phase 2-6 runtime files under `apps/web/src/lib/ai`,
  `apps/web/src/app/api/policies/analyze`, `packages/domain-ai`,
  `apps/web/src/app/api/share-pack`,
  `apps/web/src/app/api/privacy/data-deletion`, and the CRM backfill core do
  not appear in the high/critical CodeQL path summary.
- Release-gate files do appear in high/critical CodeQL paths, including
  command-line injection, request forgery, clear-text logging, and URL
  sanitization findings. This is the concrete security reason release-gate
  parallelization is deferred.
- This gate does not remediate Dependabot or CodeQL backlog. Each future
  implementation slice must re-check alert overlap for its touched files before
  coding starts.
