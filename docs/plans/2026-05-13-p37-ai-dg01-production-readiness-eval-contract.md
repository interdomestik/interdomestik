---
status: design-review
date: 2026-05-13
slice: P37-AI-DG01
title: AI Production Readiness Gate And Eval Contract
owner: platform + product + security + qa
phase: Phase C
---

# P37-AI-DG01 AI Production Readiness Gate And Eval Contract

## Decision

P37 starts with an AI production-readiness design gate before any new AI runtime behavior is
implemented.

The current repo already has a bounded AI foundation: `domain-ai` owns workflow names, model
profiles, schema versions, deterministic extraction helpers, telemetry helpers, and read models;
the web app queues policy and claim document work through `ai_runs`; staff/admin review can approve,
reject, or correct extracted output; and `pnpm ai:eval` runs deterministic fixture checks for policy
extraction, claim summary, and legal document extraction.

The next bounded implementation slice is:

`P37-AI01 Policy Extract Strict Output Contract And Eval Gate`

This slice is ranked first because the existing eval runner still needs a policy-specific
normalization shim: the live policy analyzer emits a UI-oriented `PolicyAnalysis` shape while
`domain-ai` defines a stricter `policyExtractSchema`. Before broader AI work, the policy extraction
workflow should persist and evaluate the same strict contract it claims through `schemaVersion`.

## Current AI Surface Inventory

| Surface                                      | Current behavior                                                                                                                     | Data boundary                                                                                                        | Contract state                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain-ai/src/models.ts`           | Defines workflows, default model profiles, prompt/schema versions, prompt cache keys, reasoning, verbosity, and output-token limits. | No customer data; configuration only.                                                                                | Central model/profile registry exists, but live workflows do not yet call Responses API through the registry.                          |
| `packages/domain-ai/src/client.ts`           | Creates an OpenAI client from `OPENAI_API_KEY`.                                                                                      | Secret-boundary only; throws if no key exists.                                                                       | Client factory exists, but no active runtime path currently calls it.                                                                  |
| `packages/domain-ai/src/schemas/**`          | Defines strict schemas for policy extraction, claim intake extraction, legal document extraction, and claim summary.                 | Schema-only; no customer data.                                                                                       | Claim/legal/summary helpers return strict schema outputs; policy extraction currently needs eval normalization before schema checking. |
| `apps/web/src/app/api/policies/analyze/**`   | Uploads a policy, writes a queued `ai_run`, emits `policy/extract.requested`, processes storage-backed policy extraction.            | Tenant id and user id are resolved at the route boundary; storage download uses tenant-prefix service-role boundary. | Queue metadata records model/prompt version; persistence accepts the UI-shaped policy analyzer result today.                           |
| `apps/web/src/lib/ai/policy-analyzer.ts`     | Deterministically parses policy text/images into `PolicyAnalysis`; image analysis is explicitly not configured.                      | Consumes document text or image buffers from tenant-scoped storage workflow.                                         | Does not emit the strict `policyExtractSchema` shape without an eval-only adapter.                                                     |
| `apps/web/src/lib/ai/claim-workflows.ts`     | Processes queued claim intake and legal document extraction runs from tenant-scoped documents.                                       | Joins queued `ai_runs`, `documents`, and `claims` by tenant id; downloads evidence through tenant storage boundary.  | Uses strict domain schemas and stores extraction rows with workflow schema versions.                                                   |
| `apps/web/src/app/api/ai/runs/[id]/route.ts` | Lets privileged users read any tenant-scoped run and members read only their own run.                                                | Rate-limited; session and tenant resolved before read; `getAiRun` scopes by tenant.                                  | Read contract is explicit and already has focused tests.                                                                               |
| `apps/web/src/app/api/ai/reviews/[id]/**`    | Lets staff-or-higher approve/reject/correct extraction output and sync corrected policy output.                                      | Route resolves tenant, role, and reviewer identity before core update; core scopes updates by tenant id.             | Corrected payloads are schema-validated for known workflows.                                                                           |
| `scripts/ai/eval/**`                         | Runs deterministic fixture evals for policy extraction, claim summary, and legal document extraction.                                | Local fixture data only; no network model call.                                                                      | Available as `pnpm ai:eval`; policy eval uses a normalization shim; CI no longer runs it on every PR by default.                       |
| `packages/domain-ai/src/telemetry.ts`        | Normalizes AI telemetry and aggregates latency, cost, cache, and human-acceptance metrics.                                           | Requires tenant id but stores no raw prompt or document text.                                                        | Helper exists; production workflow persistence does not yet emit a unified telemetry event stream.                                     |

## Required Contract For AI-Affected Slices

Any later AI-affected slice must document and test the following before merge:

- Workflow: the exact `AiWorkflow`, owner, model profile, prompt/schema version, and fallback
  behavior.
- Data boundary: tenant id source, user/role scope, document/source provenance, PII fields consumed,
  PII fields emitted, retention path, and redaction/logging policy.
- Prompt/model contract: prompt ownership, prompt version bump rule, model identifier, reasoning
  level, output-token budget, and allowed tool or retrieval scope.
- Structured output: strict schema, parser location, validation failure behavior, and whether
  corrected human-review payloads reuse the same parser.
- Evals: fixture dataset, expected fields, hallucination or unsupported-field checks, adversarial
  cases, tenant-boundary cases when data access is involved, and pass/fail thresholds.
- Guardrails: input validation, tenant/retrieval/tool authorization, output validation, human-review
  requirements, refusal/error handling, and uncertainty messaging.
- Observability: trace/run id, tenant-safe fields, workflow, model, prompt version, schema version,
  latency, token/cost counters when available, status, error code, review status, and alertable
  degradation metrics.
- Release evidence: focused unit/domain tests, `pnpm ai:eval` when AI workflow behavior changes,
  `pnpm security:guard`, relevant static checks, PR comments/Copilot/Sonar/CI inspection, and
  post-merge monitoring notes.

## Promoted Slice

`P37-AI01 Policy Extract Strict Output Contract And Eval Gate`

Implementation scope:

- Make policy extraction persist and review a strict `policyExtractSchema`-compatible output, or add
  a narrow production adapter that converts `PolicyAnalysis` into the strict contract before
  `document_extractions` and `ai_runs.outputJson` are written.
- Remove the policy-extract eval-only normalization shim once the live policy path emits the strict
  contract directly.
- Add focused tests proving policy extraction output includes required provider, policy number,
  coverage amount, currency, deductible, confidence, and warnings fields without hallucinating absent
  values.
- Add at least one adversarial fixture proving unsupported or absent policy facts remain warnings or
  known placeholders rather than invented values.
- Run and record `pnpm ai:eval` as blocking local proof for this slice.
- Preserve the existing queued/background policy workflow and member upload behavior.

Allowed touch points for P37-AI01:

- `packages/domain-ai/src/schemas/policy-extract.ts` and focused tests if the strict schema needs a
  backward-compatible version bump.
- `apps/web/src/lib/ai/policy-analyzer.ts` and focused tests.
- `apps/web/src/app/api/policies/analyze/_services.ts` and focused tests.
- `scripts/ai/eval/**` for fixture and runner updates directly tied to policy output contract proof.
- `docs/plans/**` for proof and closeout state.

Must not touch in P37-AI01:

- `apps/web/src/proxy.ts`.
- Canonical routes `/member`, `/agent`, `/staff`, or `/admin`.
- Auth provider layering, session shape, or tenancy architecture.
- New model calls, prompt rewrites, RAG, assistants, agentic workflows, or automation.
- Claim intake, legal extraction, claim summary behavior outside regression proof.
- Stripe.
- README, AGENTS, or broad architecture docs.
- Broad UX redesign, CRM continuation, task aggregate work, campaigns, cron/NPS architecture,
  `member_leads` unification, dashboard analytics expansion, or broad DB posture burn-down.

## Acceptance Criteria For P37-AI01

- The policy extraction runtime output conforms to the same strict schema used by evals and review
  correction.
- `pnpm ai:eval` no longer needs a policy-only normalization shim to validate policy extraction.
- Focused policy analyzer/service tests cover complete extraction, sparse extraction, unsupported
  fields, and no hallucinated absent facts.
- Existing queued policy upload and background processing behavior remain unchanged for users.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, broad architecture-doc, new
  model-call, prompt, RAG, assistant, or agentic-workflow changes are introduced.

## Verification Plan

- `pnpm ai:eval`.
- Focused `domain-ai` policy schema tests if touched.
- Focused web policy analyzer and policy analysis service tests.
- `pnpm security:guard`.
- Relevant static/type checks.
- `pnpm verify-slice -- --static`.
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Non-Goals

- No new runtime model provider behavior.
- No prompt rewrite.
- No RAG, assistant, tool-calling, or agentic workflow work.
- No claim intake, legal extraction, or claim summary refactor.
- No product UI redesign.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or broad architecture-doc
  changes.
