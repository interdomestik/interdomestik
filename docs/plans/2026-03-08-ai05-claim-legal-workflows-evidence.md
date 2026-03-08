---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
---

# AI05 Claim And Legal Workflow Evidence

> Status: Active supporting input. This document records the code and verification evidence for `AI05` claim and legal document workflow work.

## Scope

`AI05` required four outcomes:

- add typed claim-intake, claim-summary, and legal-document extraction workflow helpers
- queue claim-intake and legal-document AI runs from claim submission and authenticated follow-up uploads while preserving legacy `claim_documents`
- process those runs in the existing Inngest background workflow surface and persist canonical `document_extractions`
- reuse the generic AI review surface instead of opening new public review routes

## Code Evidence

- domain AI workflow exports and tests in [index.ts](../../packages/domain-ai/src/index.ts), [intake-extract.ts](../../packages/domain-ai/src/claims/intake-extract.ts), [intake-extract.test.ts](../../packages/domain-ai/src/claims/intake-extract.test.ts), [summary.ts](../../packages/domain-ai/src/claims/summary.ts), [summary.test.ts](../../packages/domain-ai/src/claims/summary.test.ts), [extract.ts](../../packages/domain-ai/src/legal/extract.ts), and [extract.test.ts](../../packages/domain-ai/src/legal/extract.test.ts)
- claim-domain queue wiring in [ai-workflows.ts](../../packages/domain-claims/src/claims/ai-workflows.ts), [ai-workflows.test.ts](../../packages/domain-claims/src/claims/ai-workflows.test.ts), [submit.ts](../../packages/domain-claims/src/claims/submit.ts), and [submit.test.ts](../../packages/domain-claims/src/claims/submit.test.ts)
- legal claim-document category support in [enums.ts](../../packages/database/src/schema/enums.ts) and [0039_add_legal_claim_document_category.sql](../../packages/database/drizzle/0039_add_legal_claim_document_category.sql)
- web background processing and event registration in [claim-workflows.ts](../../apps/web/src/lib/ai/claim-workflows.ts), [claim-workflows.test.ts](../../apps/web/src/lib/ai/claim-workflows.test.ts), and [functions.ts](../../apps/web/src/lib/inngest/functions.ts)
- claim submit and upload integration in [submit.core.ts](../../apps/web/src/actions/claims/submit.core.ts), [actions.ts](../../apps/web/src/features/member/claims/actions.ts), [actions.test.ts](../../apps/web/src/features/member/claims/actions.test.ts), and [ClaimEvidenceUploadDialog.tsx](../../apps/web/src/features/member/claims/components/ClaimEvidenceUploadDialog.tsx)
- generic review-payload expansion in [\_core.ts](../../apps/web/src/app/api/ai/reviews/[id]/_core.ts) and [\_core.test.ts](../../apps/web/src/app/api/ai/reviews/[id]/_core.test.ts)

## Focused Verification Evidence

The following focused checks passed on 2026-03-08:

- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm db:migrations:check-journal`
- `pnpm --filter @interdomestik/domain-ai test:unit --run src/claims/intake-extract.test.ts src/claims/summary.test.ts src/legal/extract.test.ts`
- `pnpm --filter @interdomestik/domain-ai type-check`
- `pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/ai-workflows.test.ts src/claims/submit.test.ts`
- `pnpm --filter @interdomestik/domain-claims type-check`
- `pnpm --filter @interdomestik/database type-check`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/ai/claim-workflows.test.ts src/features/member/claims/actions.test.ts 'src/app/api/ai/reviews/[id]/_core.test.ts'`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/claims.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-wizard.ui-v2.test.tsx`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/web exec eslint apps/web/src/actions/claims/submit.core.ts apps/web/src/app/api/ai/reviews/[id]/_core.ts apps/web/src/features/member/claims/actions.ts apps/web/src/features/member/claims/actions.test.ts apps/web/src/features/member/claims/components/ClaimEvidenceUploadDialog.tsx apps/web/src/lib/ai/claim-workflows.ts apps/web/src/lib/ai/claim-workflows.test.ts apps/web/src/lib/inngest/functions.ts packages/domain-claims/src/claims/ai-workflows.ts packages/domain-claims/src/claims/ai-workflows.test.ts packages/domain-claims/src/claims/submit.ts packages/domain-claims/src/claims/submit.test.ts`

## Required Gate Evidence

The required repository gates also passed on 2026-03-08:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Conclusion

`AI05` is complete for code and verification evidence.

The repository now queues and processes claim-intake and legal-document AI workflows on the same tenant-scoped provenance, background execution, and review rails established by `AI02` through `AI04`.
