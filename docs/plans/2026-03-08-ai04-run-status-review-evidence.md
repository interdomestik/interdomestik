---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
---

# AI04 Run Status And Review Evidence

> Status: Active supporting input. This document records the code and verification evidence for `AI04` AI run status and human review work.

## Scope

`AI04` required three outcomes:

- add a tenant-scoped read model for AI run status and extraction state
- expose authenticated run-status and human-review APIs
- update the member policy upload experience to reflect queued, processing, completed, needs-review, and failed workflow states

## Code Evidence

- domain read model export and implementation in [index.ts](../../packages/domain-ai/src/index.ts), [get-run.ts](../../packages/domain-ai/src/read-models/get-run.ts), and [get-run.test.ts](../../packages/domain-ai/src/read-models/get-run.test.ts)
- AI run API in [route.ts](../../apps/web/src/app/api/ai/runs/[id]/route.ts) and [route.test.ts](../../apps/web/src/app/api/ai/runs/[id]/route.test.ts)
- human review core and route in [\_core.ts](../../apps/web/src/app/api/ai/reviews/[id]/_core.ts), [\_core.test.ts](../../apps/web/src/app/api/ai/reviews/[id]/_core.test.ts), [route.ts](../../apps/web/src/app/api/ai/reviews/[id]/route.ts), and [route.test.ts](../../apps/web/src/app/api/ai/reviews/[id]/route.test.ts)
- member upload polling and state rendering in [PolicyUploadV2Page.tsx](../../apps/web/src/features/member/policies/components/PolicyUploadV2Page.tsx) and [PolicyUploadV2Page.test.tsx](../../apps/web/src/features/member/policies/components/PolicyUploadV2Page.test.tsx)

## Focused Verification Evidence

The following focused checks passed on 2026-03-08:

- `pnpm --filter @interdomestik/domain-ai test:unit --run src/read-models/get-run.test.ts`
- `pnpm --filter @interdomestik/domain-ai type-check`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/ai/runs/[id]/route.test.ts' 'src/app/api/ai/reviews/[id]/route.test.ts' 'src/app/api/ai/reviews/[id]/_core.test.ts' 'src/features/member/policies/components/PolicyUploadV2Page.test.tsx'`
- `pnpm --filter @interdomestik/web type-check`

## Required Gate Evidence

The required repository gates also passed on 2026-03-08:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Conclusion

`AI04` is complete for code and verification evidence.

The repository now exposes tenant-scoped AI run status and human-review surfaces, and that slice is recognized as complete in the live program and tracker.
