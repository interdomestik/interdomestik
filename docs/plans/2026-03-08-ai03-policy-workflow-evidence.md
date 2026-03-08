---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
---

# AI03 Policy Workflow Evidence

> Status: Active supporting input. This document records the code and verification evidence for `AI03` background policy extraction workflow work.

## Scope

`AI03` required three outcomes:

- move policy extraction off the request path so uploads queue work instead of synchronously extracting
- register the policy extraction flow in Inngest and execute background processing against the stored document
- make background persistence durable and idempotent so queued runs transition cleanly through processing, completion, and failure

## Code Evidence

- request validation and payload shaping in [\_core.ts](../../apps/web/src/app/api/policies/analyze/_core.ts) and [\_core.test.ts](../../apps/web/src/app/api/policies/analyze/_core.test.ts)
- enqueue and background persistence split in [\_services.ts](../../apps/web/src/app/api/policies/analyze/_services.ts) and [\_services.test.ts](../../apps/web/src/app/api/policies/analyze/_services.test.ts)
- queued request-path contract in [route.ts](../../apps/web/src/app/api/policies/analyze/route.ts) and [route.test.ts](../../apps/web/src/app/api/policies/analyze/route.test.ts)
- background workflow registration in [functions.ts](../../apps/web/src/lib/inngest/functions.ts)
- member upload feedback for queued processing in [PolicyUploadV2Page.tsx](../../apps/web/src/features/member/policies/components/PolicyUploadV2Page.tsx)

## Focused Verification Evidence

The following focused checks passed on 2026-03-08:

- `pnpm --filter @interdomestik/web test:unit --run src/app/api/policies/analyze/_core.test.ts src/app/api/policies/analyze/_services.test.ts src/app/api/policies/analyze/route.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web exec eslint src/app/api/policies/analyze src/lib/inngest/functions.ts src/features/member/policies/components/PolicyUploadV2Page.tsx`

## Required Gate Evidence

The required repository gates also passed on 2026-03-08:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Conclusion

`AI03` is complete for code and verification evidence.

The policy extraction flow now queues durable AI work, runs in the background through Inngest, and is recognized as complete in the live program and tracker.
