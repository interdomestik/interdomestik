# MOB-03a Vault + AI Extraction Consent Display Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available and authorized) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, MK-only Vault summary for vehicle/property member claims that displays evidence-category metadata and the latest AI-document-extraction consent state without exposing raw document or subject data.

**Architecture:** A pure `domain-claims` mapper owns the fail-closed display contract and deterministic consent selection. A server-only query first verifies the exact MK tenant, then reads evidence documents and exact `ai_document_extraction` consent rows with tenant, member, claim, document, type, and purpose predicates. A focused member card renders the serialized discriminated result on the existing claim-detail surface; no route, writer, schema, storage, auth, proxy, or tenancy behavior changes.

**Tech Stack:** TypeScript, React 19, Next.js 15 App Router, Drizzle ORM, Vitest, Testing Library, next-intl, Playwright.

**Authority:** `docs/plans/2026-07-12-mob-dg04b-mob-03a-current-authority.md`, Rev 104 addendum, merged through PRs `#1330` and `#1331`.

---

## Chunk 1: Contract And Read Path

### Task 1: Build the pure fail-closed display contract

**Files:**

- Create: `packages/domain-claims/src/claims/vault-consent-display.ts`
- Create: `packages/domain-claims/src/claims/vault-consent-display.test.ts`
- Modify: `packages/domain-claims/src/index.ts`

- [ ] **Step 1: Write failing tests for tenant, category, and erasure gates**

Cover these cases before implementation:

```ts
expect(buildVaultConsentDisplay(input({ tenantCode: 'KS' }))).toEqual({ kind: 'hidden' });
expect(buildVaultConsentDisplay(input({ tenantCountryCode: 'AL' }))).toEqual({ kind: 'hidden' });
expect(buildVaultConsentDisplay(input({ claimCategory: 'injury' }))).toEqual({ kind: 'hidden' });
expect(buildVaultConsentDisplay(input({ piiStatus: 'erased_or_unavailable' }))).toEqual({
  kind: 'subject_erased',
});
```

Also prove that `subject_erased` has no `items` property.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/vault-consent-display.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Define the discriminated output and internal source types**

```ts
export type VaultConsentDisplay =
  | { kind: 'hidden' }
  | { kind: 'subject_erased' }
  | { kind: 'ready'; items: VaultConsentDisplayItem[] };

export interface VaultConsentDisplayItem {
  category: 'evidence';
  updatedAt: Date | null;
  consentStatus: 'accepted' | 'withdrawn' | 'missing';
  consentRecordedAt: Date | null;
  consentVersion: string | null;
}
```

Internal inputs may carry document and consent IDs for joining, but exported output must not.

- [ ] **Step 4: Write failing tests for safe mapping and deterministic selection**

Prove:

- only document category `evidence` survives;
- `legal`, medical-like, or unknown document categories are absent;
- only `consentType=ai_document_extraction` and
  `processingPurpose=ai_document_extraction` are eligible;
- latest consent sorts by `recordedAt DESC, id DESC`;
- accepted consent exposes `privacyVersion`;
- withdrawn consent sets `consentVersion=null`;
- missing consent sets recorded time and version to `null`;
- `updatedAt` is the latest available document/consent timestamp and remains
  `null` when both are absent;
- serialized output contains none of `id`, `documentId`, `name`, `fileType`,
  `fileSize`, `filePath`, `storagePath`, or subject/user fields.

- [ ] **Step 5: Implement the minimal mapper**

Use explicit allowlists and a deterministic comparator. Never accept a generic consent type or infer a missing value.

- [ ] **Step 6: Run domain tests and type-check**

```bash
pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/vault-consent-display.test.ts
pnpm --filter @interdomestik/domain-claims type-check
```

Expected: PASS.

- [ ] **Step 7: Verify file size and commit**

```bash
wc -l packages/domain-claims/src/claims/vault-consent-display.ts packages/domain-claims/src/claims/vault-consent-display.test.ts
pnpm check:modularity-guard
git add packages/domain-claims/src/claims/vault-consent-display.ts packages/domain-claims/src/claims/vault-consent-display.test.ts packages/domain-claims/src/index.ts
git commit -m "feat: add MOB-03a display contract"
```

Production file target: `<=150` lines. Keep the test at `<=200` lines or record the governed test-only exception before proceeding.

### Task 2: Add the server-only tenant and consent read

**Files:**

- Create: `apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.ts`
- Create: `apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.test.ts`

- [ ] **Step 1: Write failing tests for query short-circuiting**

Mock the database adapter and prove exact `{ code: 'MK', countryCode: 'MK' }`
continues. Missing, KS, AL, and mismatched code/country rows must return `hidden`
before `claim_documents` is queried. Non-vehicle/property claims must also stop
before document reads; erased subjects return `subject_erased` before reads.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberVaultConsentDisplay.test.ts
```

Expected: FAIL because the server module does not exist.

- [ ] **Step 3: Implement the exact tenant gate**

The first query selects only `tenants.code` and `tenants.countryCode` for
`eq(tenants.id, tenantId)`. Return `{ kind: 'hidden' }` unless both equal `MK`.
Do not query documents or consents on the hidden path.

- [ ] **Step 4: Write failing tests for DB predicates and no-leak output**

Prove the document read filters tenant, claim, and category=`evidence`. Prove
the consent read filters tenant, subject, claim, eligible document IDs,
`consentType=ai_document_extraction`, and
`processingPurpose=ai_document_extraction`, ordered by
`recordedAt DESC, id DESC`. If no eligible document exists, skip the consent
query.

- [ ] **Step 5: Implement the minimal server-only read**

Read only:

```text
tenants: code, countryCode
claim_documents: id, category, createdAt
claim_document_ai_extraction_consents:
  id, documentId, consentType, processingPurpose, status, recordedAt, privacyVersion
```

Pass internal rows to `buildVaultConsentDisplay`. Add required
`db-access-guard` explanations. Do not import a writer, storage, download,
upload, share-pack, event, or outbox module.

- [ ] **Step 6: Run focused query proof**

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberVaultConsentDisplay.test.ts
pnpm check:db-access
pnpm --filter @interdomestik/web type-check
```

Expected: PASS.

- [ ] **Step 7: Verify file size and commit**

```bash
wc -l apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.ts apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.test.ts
pnpm check:modularity-guard
git add apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.ts apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.test.ts
git commit -m "feat: add tenant-safe MOB-03a read"
```

## Chunk 2: Claim Detail Integration And UI

### Task 3: Integrate the safe DTO without growing legacy files

**Files:**

- Create: `apps/web/src/features/claims/tracking/server/member-claim-documents.ts`
- Create: `apps/web/src/features/claims/tracking/server/member-vault-consent-serialization.ts`
- Create: `apps/web/src/features/claims/tracking/server/member-vault-consent-serialization.test.ts`
- Modify: `apps/web/src/features/claims/tracking/server/getMemberClaimDetail.ts`
- Modify: `apps/web/src/features/claims/tracking/types.ts`
- Modify: `apps/web/src/app/[locale]/(app)/member/claims/[id]/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/claims/[id]/page.test.tsx`
- Modify: `apps/web/src/features/claims/tracking/server/getMemberClaimDetail.test.ts`

- [ ] **Step 1: Record baseline line counts**

```bash
wc -l apps/web/src/features/claims/tracking/server/getMemberClaimDetail.ts apps/web/src/app/'[locale]'/'(app)'/member/claims/'[id]'/page.tsx apps/web/src/features/claims/tracking/types.ts
```

Expected baseline: `getMemberClaimDetail.ts` is `156` lines and must finish smaller.

- [ ] **Step 2: Write failing integration tests**

Expect `vaultConsentDisplay` in `getMemberClaimDetail.test.ts` and prove the
helper receives claim ID/category, tenant/member, and erasure status. In the
page test, prove `ready` dates become ISO strings while `hidden` and
`subject_erased` keep their discriminants without item arrays.

- [ ] **Step 3: Run tests and confirm RED**

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberClaimDetail.test.ts src/app/\[locale\]/\(app\)/member/claims/\[id\]/page.test.tsx
```

Expected: FAIL because the DTO has no Vault field.

- [ ] **Step 4: Extract existing document mapping**

Move the current `claim.documents` mapping into `member-claim-documents.ts`.
Replace the inline block with one call so `getMemberClaimDetail.ts` ends at or
below 150 lines after the new read is added.

- [ ] **Step 5: Add the Vault field and serializer**

Add `vaultConsentDisplay: VaultConsentDisplay` to `ClaimTrackingDetailDto`.
Call `getMemberVaultConsentDisplay` only after the owner-scoped claim exists.
Serialize only `updatedAt` and `consentRecordedAt` in `ready`; never add IDs.

- [ ] **Step 6: Run integration tests and line checks**

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberClaimDetail.test.ts src/features/claims/tracking/server/member-vault-consent-serialization.test.ts src/app/\[locale\]/\(app\)/member/claims/\[id\]/page.test.tsx
wc -l apps/web/src/features/claims/tracking/server/getMemberClaimDetail.ts apps/web/src/features/claims/tracking/server/member-claim-documents.ts apps/web/src/features/claims/tracking/server/member-vault-consent-serialization.ts
pnpm check:modularity-guard
```

Expected: PASS; touched production files `<=150` lines.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/claims/tracking/server/getMemberClaimDetail.ts apps/web/src/features/claims/tracking/server/getMemberClaimDetail.test.ts apps/web/src/features/claims/tracking/server/member-claim-documents.ts apps/web/src/features/claims/tracking/server/member-vault-consent-serialization.ts apps/web/src/features/claims/tracking/server/member-vault-consent-serialization.test.ts apps/web/src/features/claims/tracking/types.ts apps/web/src/app/'[locale]'/'(app)'/member/claims/'[id]'/page.tsx apps/web/src/app/'[locale]'/'(app)'/member/claims/'[id]'/page.test.tsx
git commit -m "feat: expose MOB-03a member DTO"
```

### Task 4: Render an accessible AI-extraction consent card

**Files:**

- Create: `apps/web/src/features/member/claims/components/MemberVaultConsentCard.tsx`
- Create: `apps/web/src/features/member/claims/components/MemberVaultConsentCard.test.tsx`
- Create: `apps/web/src/features/member/claims/components/MemberClaimEvidenceSection.tsx`
- Modify: `apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx`
- Modify: `apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx`
- Modify: `apps/web/src/messages/sq/claims-tracking.json`
- Modify: `apps/web/src/messages/mk/claims-tracking.json`
- Modify: `apps/web/src/messages/en/claims-tracking.json`

- [ ] **Step 1: Write failing component tests**

Prove `hidden` renders no marker; `subject_erased` renders one neutral skeleton
without item count; accepted, withdrawn, and missing states have distinct safe
copy; withdrawn/missing never render a granted version; headings and statuses
have accessible names; output contains no internal ID, filename, MIME type,
size, path, URL, medical, payment, or private-legal text; and all copy says AI
document extraction.

- [ ] **Step 2: Run component tests and confirm RED**

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/member/claims/components/MemberVaultConsentCard.test.tsx
```

Expected: FAIL because the card does not exist.

- [ ] **Step 3: Implement Albanian, Macedonian, and English copy**

Add `claims-tracking.vault_consent` keys for title, exact AI-extraction
description, evidence category, last metadata update, accepted/withdrawn/missing
status, recorded date, version, empty/unavailable states, and erased skeleton.
Avoid unqualified consent claims in descriptions.

- [ ] **Step 4: Implement the focused card and evidence-section extraction**

Use a semantic `<section>`, heading, definition-list or list semantics, visible
status text, and `data-testid="member-vault-consent"`. Format dates with the
existing pilot helper. Add no action, link, download, upload, or mutation.

Extract the existing `OpsDocumentsPanel` block into
`MemberClaimEvidenceSection.tsx`, then place the new card beside it. Preserve
existing upload/document behavior while shrinking the 405-line
`MemberClaimDetailOpsPage.tsx`.

- [ ] **Step 5: Run UI and i18n proof**

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/member/claims/components/MemberVaultConsentCard.test.tsx src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx
pnpm i18n:check
pnpm i18n:purity:check
```

Expected: PASS.

- [ ] **Step 6: Verify line counts and commit**

```bash
wc -l apps/web/src/features/member/claims/components/MemberVaultConsentCard.tsx apps/web/src/features/member/claims/components/MemberClaimEvidenceSection.tsx apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx
pnpm check:modularity-guard
git add apps/web/src/features/member/claims/components/MemberVaultConsentCard.tsx apps/web/src/features/member/claims/components/MemberVaultConsentCard.test.tsx apps/web/src/features/member/claims/components/MemberClaimEvidenceSection.tsx apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.tsx apps/web/src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx apps/web/src/messages/sq/claims-tracking.json apps/web/src/messages/mk/claims-tracking.json apps/web/src/messages/en/claims-tracking.json
git commit -m "feat: render MOB-03a consent summary"
```

## Chunk 3: Browser, Security, And Delivery Proof

### Task 5: Add MK browser proof and forbidden-field checks

**Files:**

- Create: `apps/web/e2e/gate/member-vault-consent-display.fixture.ts`
- Create: `apps/web/e2e/gate/member-vault-consent-display.spec.ts`

- [ ] **Step 1: Build a cleanup-safe MK fixture**

Insert one evidence `claim_documents` row and one matching
`claim_document_ai_extraction_consents` row for the seeded MK member claim. Use
unique IDs and delete consent before document in `finally`. Fixture writes are
test-only; production remains read-only.

- [ ] **Step 2: Write the browser test**

For `gate-mk-mk`, navigate to the member claim detail, assert the exact AI
extraction title/status/version/date, check keyboard focus adds no new action,
resize to `320x740`, prove no horizontal overflow, and prove the unique
document ID/name/path and forbidden categories never appear in text or links.
For a KS project, assert the marker count is `0`.

- [ ] **Step 3: Run focused browser proof**

```bash
pnpm --filter @interdomestik/web test:e2e -- e2e/gate/member-vault-consent-display.spec.ts --project=gate-mk-mk --project=gate-ks-sq --workers=1
```

Expected: PASS.

- [ ] **Step 4: Run Playwright MCP watched proof**

Use configured Playwright MCP for MK desktop, MK 320-pixel mobile, a neutral
withdrawn/missing or erased state where fixtures permit, accessibility snapshot,
and browser console errors. Save screenshots only under
`/tmp/interdomestik-pilot-evidence/`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/gate/member-vault-consent-display.fixture.ts apps/web/e2e/gate/member-vault-consent-display.spec.ts
git commit -m "test: prove MOB-03a member display"
```

### Task 6: Run static scope and security proof

**Files:**

- Modify only if required by canonical scripts: `scripts/repo-size-budget.json`

- [ ] **Step 1: Prove protected surfaces are untouched**

```bash
git diff --name-only origin/main...HEAD
git diff --name-only origin/main...HEAD | rg '^(apps/web/src/proxy.ts|packages/database/src/schema|packages/database/drizzle|docs/architecture|README.md|AGENTS.md)$' && exit 1 || true
```

- [ ] **Step 2: Prove no forbidden imports or client fields across the full production diff**

```bash
git diff -U0 origin/main...HEAD -- '*.ts' '*.tsx' | rg '^\+.*(storagePath|filePath|signedUrl|sharePack|db\.insert|db\.update|db\.delete|outbox)' && exit 1 || true
rg -n "storagePath|filePath|signedUrl|download|upload|sharePack|insert\(|update\(|delete\(" packages/domain-claims/src/claims/vault-consent-display.ts apps/web/src/features/claims/tracking/server/getMemberVaultConsentDisplay.ts apps/web/src/features/claims/tracking/server/member-vault-consent-serialization.ts apps/web/src/features/member/claims/components/MemberVaultConsentCard.tsx
```

Expected: no writer/storage path in any added production line, and no document
action or forbidden client field in the new mapper/query/serializer/card safety
boundary. The extracted evidence section may preserve the pre-existing
`OpsDocumentsPanel` behavior; tests may name forbidden fields.

- [ ] **Step 3: Run focused static gates**

```bash
pnpm check:db-access
pnpm check:modularity-guard
pnpm check:architecture-boundaries
pnpm i18n:check
pnpm i18n:purity:check
pnpm --filter @interdomestik/domain-claims type-check
pnpm --filter @interdomestik/web type-check
```

- [ ] **Step 4: Sync repo-size budget after files settle**

```bash
node scripts/repo-size-budget-sync.mjs
pnpm repo:size:check
git add scripts/repo-size-budget.json
git commit -m "chore: sync MOB-03a repo size budget"
```

Skip the commit if the script produces no change.

### Task 7: Final review, Phase C gates, PR, and merge

**Files:** None unless review finds a defect.

- [ ] **Step 1: Generate the Tier 3 gate plan and workflow scorecard**

```bash
node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/gate-plan.mjs --class=implementation --tier=3 --surface=privacy --surface=ui --surface=db-read
node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/workflow-scorecard.mjs .
```

- [ ] **Step 2: Run bounded senior and security review**

Use a redacted diff packet. Run Sonnet 4.6, Gemini 3.1 Pro Preview as the Tier 3
second signal, and Opus only for unresolved disagreement or blocked required
evidence. Run diff-scoped Codex Security when available. Remediate every real
blocker and rerun the completed senior route after substantive changes.

- [ ] **Step 3: Run final mandatory gates once**

```bash
pnpm slice:verify
pnpm ci:local:pr
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

If a duplicate lane exits `137` after equivalent mandatory gates pass, record
`local_resource_kill/exit_137` instead of a product defect.

- [ ] **Step 4: Open one implementation PR**

Include scope, exact data sources, tenant/member predicates, AI-extraction-only
copy, forbidden-field proof, browser/a11y evidence, review, rollback, residual
risks, and Tier 3 human-approval requirement.

- [ ] **Step 5: Monitor current-head feedback and checks**

Run feedback intake, request Copilot review, and monitor Sonar issues, CodeQL,
gitleaks, pnpm-audit, PR E2E, Pilot Gate, CI, and review threads. Merge only
when local/PR/feedback/check head SHAs match and real findings are resolved.

- [ ] **Step 6: Merge with human approval and close out**

After merge, update current program/tracker and the MOB-03a closeout in a scoped
closeout PR, verify post-merge main health, run a safe live member smoke, clean
the branch/worktree, and leave `REC-02` unpromoted.

---

## Non-Goals That Stop Execution

Stop and return to current authority if any task needs medical/injury data,
legal-category rendering, document content/name/ID/link/path, general consent
claims, upload/download/storage, a writer/event/outbox, schema/RLS/migration,
auth/proxy/routing/session/tenancy, sponsor/payer/partner exposure,
staff/agent/admin UI, KS/AL exposure, billing, Agreement Ceremony, or broad
`MOB-03` behavior.
