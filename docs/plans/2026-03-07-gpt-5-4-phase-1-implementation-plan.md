---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-07
---

# GPT-5.4 Phase 1 Implementation Plan

> Status: Active supporting input. This plan does not replace [current-program.md](./current-program.md) or [current-tracker.md](./current-tracker.md). It defines the background AI runway after the `v0.1.0` convergence slice is stable enough to absorb it.
>
> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tenant-safe, typed, durable AI extraction layer for policy and document workflows using OpenAI GPT-5.4 where it adds real value, without blocking the current `v0.1.0` release convergence work.

**Architecture:** Introduce a dedicated `packages/domain-ai` boundary for AI use cases and schemas. HTTP routes stay thin: they upload or reference a document, persist an `ai_run`, and enqueue Inngest work. Inngest executes extraction and review in the background, writes provenance-rich results, and exposes them through read-side APIs. GPT-5.4 is reserved for ambiguous and high-value document reasoning; cheaper GPT-5 variants handle routing and simpler extraction.

**Tech Stack:** OpenAI Responses API, structured outputs, Zod, Drizzle, Inngest, Next.js App Router, Sentry, Vitest.

---

## Design Choice

### Recommended Option: Domain AI + Background Workflow

This is the recommended path.

- keep `apps/web` as transport only
- create one typed AI boundary
- use Inngest for durable execution
- persist provenance and review state
- use GPT-5.4 selectively instead of universally

This matches the current repo direction better than two alternatives:

- inline route calls to the model
  - fastest to demo
  - worst for retries, latency, and auditability
- external AI microservice
  - clean isolation
  - too much operational overhead for this phase

## Current Repo Constraints And Gaps

These facts shape the plan:

- the current policy analyzer is regex-based and image analysis is still a stub in [policy-analyzer.ts](../../apps/web/src/lib/ai/policy-analyzer.ts#L37)
- the policy route core still uses `any` for analysis and persistence in [analyze \_core.ts](../../apps/web/src/app/api/policies/analyze/_core.ts#L4)
- policy persistence stores raw `analysisJson` only in [policies.ts](../../packages/database/src/schema/policies.ts#L6)
- the repo already has tenant-safe polymorphic document patterns in [documents.ts](../../packages/database/src/schema/documents.ts#L33)
- async work is not durable today because the local queue is an in-memory singleton in [job-queue.ts](../../packages/shared-utils/src/job-queue.ts#L18)
- Inngest exists, but only for cron messaging in [functions.ts](../../apps/web/src/lib/inngest/functions.ts#L13)
- the web package does not currently include an OpenAI SDK dependency in [apps/web/package.json](../../apps/web/package.json#L28)

## Explicit Non-Goals

- no changes to [proxy.ts](../../apps/web/src/proxy.ts)
- no route renames
- no autonomous claim decisions
- no autonomous legal determinations
- no customer-facing AI decisions without a human review gate
- no broad RAG rollout in phase 1

## Phase 1 Scope

Phase 1 should cover four bounded use cases only:

1. `policy_extract`
2. `claim_intake_extract`
3. `legal_doc_extract`
4. `claim_summary`

Everything else stays out until these four are typed, durable, and measurable.

## Task 1: Create The `domain-ai` Boundary

**Files:**

- Create: `packages/domain-ai/package.json`
- Create: `packages/domain-ai/tsconfig.json`
- Create: `packages/domain-ai/vitest.config.ts`
- Create: `packages/domain-ai/src/index.ts`
- Create: `packages/domain-ai/src/client.ts`
- Create: `packages/domain-ai/src/types.ts`
- Create: `packages/domain-ai/src/models.ts`
- Create: `packages/domain-ai/src/schemas/policy-extract.ts`
- Create: `packages/domain-ai/src/schemas/claim-intake-extract.ts`
- Create: `packages/domain-ai/src/schemas/legal-doc-extract.ts`
- Create: `packages/domain-ai/src/schemas/claim-summary.ts`
- Test: `packages/domain-ai/src/schemas/policy-extract.test.ts`
- Modify: `../../package.json`
- Modify: `../../apps/web/package.json`

**Step 1: Write the failing schema tests**

Write tests that prove the output contracts reject malformed AI output and accept valid output.

```ts
import { describe, expect, it } from 'vitest';
import { policyExtractSchema } from './policy-extract';

describe('policyExtractSchema', () => {
  it('accepts a valid extraction payload', () => {
    expect(
      policyExtractSchema.parse({
        provider: 'Allianz',
        policyNumber: 'POL-12345',
        coverageAmount: 75000,
        currency: 'EUR',
        deductible: 1000,
        confidence: 0.92,
        warnings: [],
      })
    ).toBeTruthy();
  });

  it('rejects non-numeric amounts', () => {
    expect(() =>
      policyExtractSchema.parse({
        provider: 'Allianz',
        policyNumber: 'POL-12345',
        coverageAmount: 'seventy five thousand',
      })
    ).toThrow();
  });
});
```

**Step 2: Run the schema test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-ai test:unit --run src/schemas/policy-extract.test.ts`

Expected: failure because the package and schema do not exist yet.

**Step 3: Implement the package skeleton**

- add `openai` and `zod` to `packages/domain-ai`
- export one client factory from `src/client.ts`
- export one schema file per use case
- define one `AiModelProfile` map in `src/models.ts`

Use this model policy:

- `gpt-5.4` for ambiguous extraction and review
- `gpt-5-mini` for stable extraction and summaries
- `gpt-5-nano` for routing and classification
- `gpt-5.4-pro` only for manual escalation paths, never as the default

**Step 4: Re-run the schema test**

Run: `pnpm --filter @interdomestik/domain-ai test:unit --run src/schemas/policy-extract.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/domain-ai package.json apps/web/package.json
git commit -m "feat: add domain ai boundary"
```

## Task 2: Add AI Provenance Tables

**Files:**

- Create: `packages/database/src/schema/ai.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/drizzle/0036_add_ai_runs.sql`
- Create: `packages/database/src/schema/ai.test.ts`
- Modify: `packages/database/src/schema/policies.ts`
- Modify: `packages/database/src/schema/documents.ts`

**Step 1: Write the failing schema test**

Write a test that asserts the new schema exposes the minimum audit fields.

```ts
import { describe, expect, it } from 'vitest';
import { aiRuns, documentExtractions } from './ai';

describe('ai schema', () => {
  it('defines ai run provenance fields', () => {
    expect(aiRuns.model).toBeTruthy();
    expect(aiRuns.promptVersion).toBeTruthy();
    expect(aiRuns.tenantId).toBeTruthy();
  });

  it('defines extraction linkage fields', () => {
    expect(documentExtractions.documentId).toBeTruthy();
    expect(documentExtractions.entityType).toBeTruthy();
    expect(documentExtractions.entityId).toBeTruthy();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @interdomestik/database test:unit --run src/schema/ai.test.ts`

Expected: failure because `src/schema/ai.ts` does not exist yet.

**Step 3: Implement the schema**

Create two tables:

- `ai_runs`
  - `id`
  - `tenantId`
  - `workflow`
  - `status`
  - `documentId`
  - `entityType`
  - `entityId`
  - `requestedBy`
  - `model`
  - `modelSnapshot`
  - `promptVersion`
  - `inputHash`
  - `requestJson`
  - `responseJson`
  - `outputJson`
  - `latencyMs`
  - `inputTokens`
  - `outputTokens`
  - `cachedInputTokens`
  - `reviewStatus`
  - `reviewedBy`
  - `errorCode`
  - `errorMessage`
  - `startedAt`
  - `completedAt`
  - `createdAt`

- `document_extractions`
  - `id`
  - `tenantId`
  - `documentId`
  - `entityType`
  - `entityId`
  - `workflow`
  - `schemaVersion`
  - `extractedJson`
  - `confidence`
  - `warnings`
  - `sourceRunId`
  - `reviewStatus`
  - `reviewedBy`
  - `createdAt`
  - `updatedAt`

Do not overload `policies.analysisJson` as the sole source of truth anymore. Keep it as a denormalized read field only if the UI still depends on it.

**Step 4: Run the schema test**

Run: `pnpm --filter @interdomestik/database test:unit --run src/schema/ai.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/schema packages/database/drizzle
git commit -m "feat: add ai provenance schema"
```

## Task 3: Implement Policy Extraction As A Durable Workflow

**Files:**

- Create: `packages/domain-ai/src/policy/extract.ts`
- Create: `packages/domain-ai/src/policy/extract.test.ts`
- Create: `apps/web/src/lib/inngest/events.ts`
- Modify: `apps/web/src/lib/inngest/functions.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts`
- Modify: `apps/web/src/app/api/policies/analyze/route.ts`
- Modify: `apps/web/src/app/api/policies/analyze/_core.ts`
- Create: `apps/web/src/app/api/policies/analyze/_services/queue-ai-run.ts`

**Step 1: Write the failing policy workflow test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { runPolicyExtract } from './extract';

describe('runPolicyExtract', () => {
  it('returns typed extraction output', async () => {
    const openai = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output: [{ type: 'output_text', text: '{}' }],
        }),
      },
    };

    await expect(
      runPolicyExtract({
        openai,
        model: 'gpt-5.4',
        promptVersion: 'policy_extract_v1',
        documentText: 'Policy number POL-123',
      })
    ).rejects.toThrow();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-ai test:unit --run src/policy/extract.test.ts`

Expected: FAIL

**Step 3: Implement the use case**

The use case should:

- call the Responses API, not Chat Completions
- request strict structured output
- use a stable `promptVersion`
- include a `prompt_cache_key`
- validate the returned JSON with Zod before persistence
- return a typed `PolicyExtractResult`

The route should change behavior:

- validate session and rate limit as today
- upload or reference the document
- create an `ai_run`
- emit an Inngest event
- return `202 Accepted` with `runId`

Do not keep GPT-5.4 on the request path.

**Step 4: Add the Inngest function**

Add one event-driven function:

- event name: `policy/extract.requested`
- steps:
  - mark run `processing`
  - fetch document input
  - execute model call
  - persist `document_extractions`
  - update policy read model
  - mark run `completed` or `failed`

**Step 5: Run focused tests**

Run:

```bash
pnpm --filter @interdomestik/domain-ai test:unit --run src/policy/extract.test.ts
pnpm --filter @interdomestik/web test:unit --run src/app/api/policies/analyze/route.test.ts
pnpm --filter @interdomestik/web type-check
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/domain-ai apps/web/src/app/api/policies/analyze apps/web/src/lib/inngest
git commit -m "feat: move policy extraction to durable ai workflow"
```

## Task 4: Add AI Run Status And Review Endpoints

**Files:**

- Create: `apps/web/src/app/api/ai/runs/[id]/route.ts`
- Create: `apps/web/src/app/api/ai/runs/[id]/route.test.ts`
- Create: `packages/domain-ai/src/read-models/get-run.ts`
- Create: `packages/domain-ai/src/read-models/get-run.test.ts`
- Create: `apps/web/src/app/api/ai/reviews/[id]/route.ts`
- Create: `apps/web/src/app/api/ai/reviews/[id]/route.test.ts`
- Modify: `apps/web/src/features/member/policies/components/MemberPoliciesV2Page.tsx`

**Step 1: Write the failing run-status test**

```ts
import { describe, expect, it } from 'vitest';

describe('GET /api/ai/runs/[id]', () => {
  it('returns a tenant-scoped ai run', async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Implement the read model**

Expose:

- run status
- workflow
- createdAt / completedAt
- extraction payload
- review status
- warning list

The member policy UI should stop implying instant AI completion. It should show:

- queued
- processing
- completed
- needs review
- failed

**Step 3: Add human review endpoint**

The review route should support:

- `approve`
- `reject`
- `correct`

This must be internal or privileged only. Phase 1 is human-in-the-loop.

**Step 4: Run tests**

Run:

```bash
pnpm --filter @interdomestik/domain-ai test:unit --run src/read-models/get-run.test.ts
pnpm --filter @interdomestik/web test:unit --run src/app/api/ai/runs/[id]/route.test.ts src/app/api/ai/reviews/[id]/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/ai apps/web/src/features/member/policies/components packages/domain-ai/src/read-models
git commit -m "feat: add ai run status and review flow"
```

## Task 5: Add Claim And Legal Document Workflows

**Files:**

- Create: `packages/domain-ai/src/claims/intake-extract.ts`
- Create: `packages/domain-ai/src/claims/summary.ts`
- Create: `packages/domain-ai/src/legal/extract.ts`
- Create: `packages/domain-ai/src/claims/intake-extract.test.ts`
- Create: `packages/domain-ai/src/claims/summary.test.ts`
- Create: `packages/domain-ai/src/legal/extract.test.ts`
- Modify: `packages/domain-claims/src/claims/create.ts`
- Modify: `packages/domain-claims/src/claims/documents.ts`
- Modify: `packages/domain-documents/src/upload.ts`
- Modify: `apps/web/src/lib/inngest/functions.ts`

**Step 1: Keep the first claim AI scope narrow**

Only support:

- intake field extraction from uploaded evidence
- internal claim summary for staff
- legal document clause extraction

Do not let AI change claim status.

**Step 2: Implement event hooks**

Emit events on:

- claim document upload
- claim submission
- legal document upload

Suggested events:

- `claim/intake-extract.requested`
- `claim/summary.requested`
- `legal/extract.requested`

**Step 3: Run focused tests**

Run:

```bash
pnpm --filter @interdomestik/domain-ai test:unit --run src/claims/intake-extract.test.ts src/claims/summary.test.ts src/legal/extract.test.ts
pnpm --filter @interdomestik/domain-claims test:unit
pnpm --filter @interdomestik/domain-documents test:unit
```

Expected: PASS

**Step 4: Commit**

```bash
git add packages/domain-ai packages/domain-claims packages/domain-documents apps/web/src/lib/inngest/functions.ts
git commit -m "feat: add claim and legal ai workflows"
```

## Task 6: Add Evaluation, Telemetry, And Cost Controls

**Files:**

- Create: `scripts/ai/eval/policy-extract.dataset.json`
- Create: `scripts/ai/eval/claim-summary.dataset.json`
- Create: `scripts/ai/eval/legal-extract.dataset.json`
- Create: `scripts/ai/eval/run.mjs`
- Create: `scripts/ai/eval/README.md`
- Modify: `../../package.json`
- Modify: `../../.github/workflows/ci.yml`
- Create: `packages/domain-ai/src/telemetry.ts`
- Create: `packages/domain-ai/src/telemetry.test.ts`

**Step 1: Add a local eval command**

Add:

```json
{
  "scripts": {
    "ai:eval": "node scripts/ai/eval/run.mjs"
  }
}
```

Track at minimum:

- schema validity rate
- key-field accuracy
- hallucination rate
- human acceptance rate
- latency per workflow
- cost per run
- cached input token rate

**Step 2: Add telemetry helpers**

Each run should emit:

- workflow
- tenantId
- promptVersion
- model
- latencyMs
- inputTokens
- outputTokens
- cachedInputTokens
- status
- reviewStatus

**Step 3: Wire a non-blocking CI lane**

Add an `ai-eval` job that:

- runs on PR when AI files change
- validates schema conformance
- runs a small deterministic fixture set

Do not make model-network evals mandatory on every PR yet. Start with fixture-based validation and local/manual full evals.

**Step 4: Run verification**

Run:

```bash
pnpm ai:eval
pnpm --filter @interdomestik/domain-ai test:unit --run src/telemetry.test.ts
pnpm -s plan:audit
```

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ai package.json .github/workflows/ci.yml packages/domain-ai/src/telemetry.ts
git commit -m "feat: add ai evals and telemetry"
```

## Efficient GPT-5.4 Usage Rules

These rules are part of the implementation, not optional polish.

### Use GPT-5.4 Only Where The Extra Reasoning Pays

- ambiguous policy extraction
- legal clause extraction
- second-pass review of low-confidence extractions
- internal next-action recommendations

Do not use GPT-5.4 for:

- route-level classification
- cheap tagging
- simple summaries after the prompt is stable
- bulk backfills without a confidence gate

### Keep Prompts Cache-Friendly

- put stable instructions first
- put schema second
- put dynamic document content last
- use one `promptVersion` per workflow
- use one stable `prompt_cache_key` per workflow and version

### Keep Context Narrow

- direct file or extracted text for single-document work
- file search only for cross-document workflows
- never dump a whole tenant corpus into one call

### Pin Snapshots

Use explicit model snapshots in production so prompt drift and model drift do not compound.

## Suggested PR Slices

1. `AI01` add `domain-ai` package and typed schemas
2. `AI02` add `ai_runs` and `document_extractions`
3. `AI03` move policy extraction to Inngest background workflow
4. `AI04` add run status and review endpoints
5. `AI05` add claim and legal workflows
6. `AI06` add evals, telemetry, and CI wiring

This keeps the rollout reviewable and reversible.

## Recommended Start Condition

Do not begin `AI03+` until the current `V03` and `V04` slices are either complete or explicitly paused. `AI01` and `AI02` can be prepared in parallel because they are background runway work and do not require routing or tenancy refactors.
