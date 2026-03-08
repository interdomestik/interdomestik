---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
---

# AI01 Domain AI Boundary Evidence

> Status: Active supporting input. This document records the code and verification evidence for `AI01` typed `domain-ai` boundary work.

## Scope

`AI01` required three outcomes:

- create a bounded `packages/domain-ai` workspace package
- define a client boundary, model-profile map, and typed schemas for planned extraction and summary workflows
- prove the schemas accept valid output and reject malformed output before any request-path AI integration begins

## Code Evidence

- workspace package scaffold and exports in [package.json](../../packages/domain-ai/package.json), [tsconfig.json](../../packages/domain-ai/tsconfig.json), [vitest.config.ts](../../packages/domain-ai/vitest.config.ts), and [index.ts](../../packages/domain-ai/src/index.ts)
- explicit AI client boundary in [client.ts](../../packages/domain-ai/src/client.ts)
- model governance map in [models.ts](../../packages/domain-ai/src/models.ts)
- versioned Zod contracts and tests for policy extraction in [policy-extract.ts](../../packages/domain-ai/src/schemas/policy-extract.ts) and [policy-extract.test.ts](../../packages/domain-ai/src/schemas/policy-extract.test.ts)
- versioned Zod contracts and tests for claim intake extraction in [claim-intake-extract.ts](../../packages/domain-ai/src/schemas/claim-intake-extract.ts) and [claim-intake-extract.test.ts](../../packages/domain-ai/src/schemas/claim-intake-extract.test.ts)
- versioned Zod contracts and tests for legal document extraction in [legal-doc-extract.ts](../../packages/domain-ai/src/schemas/legal-doc-extract.ts) and [legal-doc-extract.test.ts](../../packages/domain-ai/src/schemas/legal-doc-extract.test.ts)
- versioned Zod contracts and tests for claim summary generation in [claim-summary.ts](../../packages/domain-ai/src/schemas/claim-summary.ts) and [claim-summary.test.ts](../../packages/domain-ai/src/schemas/claim-summary.test.ts)
- root domain test sweep now includes `@interdomestik/domain-ai` in [package.json](../../package.json)

## Focused Verification Evidence

The following focused checks passed on 2026-03-08:

- `pnpm --filter @interdomestik/domain-ai type-check`
- `pnpm test:unit:domains`

## Required Gate Evidence

The required repository gates also passed on 2026-03-08:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Notes

- `pnpm-lock.yaml` changed materially when the new workspace importer and dependency graph were recorded. The verification commands above passed against that resulting lockfile state.

## Conclusion

`AI01` is complete for code and verification evidence.

The repository now has a typed AI boundary that remains off the request path. `AI02` through `AI06` remain non-committed input until they are explicitly promoted into the live program and tracker.
