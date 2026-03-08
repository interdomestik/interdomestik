---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
---

# AI02 AI Provenance Evidence

> Status: Active supporting input. This document records the code and verification evidence for `AI02` durable AI provenance persistence work.

## Scope

`AI02` required three outcomes:

- add tenant-scoped `ai_runs` and `document_extractions` persistence with migration coverage and RLS
- promote policy uploads into canonical `documents` entities so provenance records attach to the policy itself
- wire the policy analyze write and read paths to the provenance layer with legacy fallback only

## Code Evidence

- provenance schema and exports in [ai.ts](../../packages/database/src/schema/ai.ts), [documents.ts](../../packages/database/src/schema/documents.ts), and [index.ts](../../packages/database/src/schema/index.ts)
- executable migrations in [0037_add_ai_provenance.sql](../../packages/database/drizzle/0037_add_ai_provenance.sql) and [0038_add_policy_document_entity.sql](../../packages/database/drizzle/0038_add_policy_document_entity.sql)
- database coverage in [ai-schema.test.ts](../../packages/database/test/ai-schema.test.ts)
- policy document upload type widening in [upload.ts](../../packages/domain-documents/src/upload.ts)
- analyze request metadata and persistence wiring in [\_core.ts](../../apps/web/src/app/api/policies/analyze/_core.ts), [\_services.ts](../../apps/web/src/app/api/policies/analyze/_services.ts), and [\_services.test.ts](../../apps/web/src/app/api/policies/analyze/_services.test.ts)
- analyze transaction coverage in [route.test.ts](../../apps/web/src/app/api/policies/analyze/route.test.ts)
- member policy read-path fallback in [\_core.ts](<../../apps/web/src/app/[locale]/(app)/member/policies/_core.ts>), [\_core.test.ts](<../../apps/web/src/app/[locale]/(app)/member/policies/_core.test.ts>), and [MemberPoliciesV2Page.tsx](../../apps/web/src/features/member/policies/components/MemberPoliciesV2Page.tsx)

## Focused Verification Evidence

The following focused checks passed on 2026-03-08:

- `pnpm --filter @interdomestik/database exec tsx --test test/ai-schema.test.ts`
- `pnpm --filter @interdomestik/database type-check`
- `pnpm db:migrations:check-journal`
- `pnpm --filter @interdomestik/web test:unit --run src/app/api/policies/analyze/_services.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/app/api/policies/analyze/route.test.ts`
- `pnpm --filter @interdomestik/web type-check`

## Required Gate Evidence

The required repository gates also passed on 2026-03-08:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Conclusion

`AI02` is complete for code and verification evidence.

The repository now has a canonical tenant-scoped provenance layer for durable AI runs and extracted document records, and that slice is recognized as complete in the live program and tracker.
