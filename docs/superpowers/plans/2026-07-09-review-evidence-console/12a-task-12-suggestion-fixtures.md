# Task 12A: Reviewer Suggestion Fixture Contract

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 12A: Validate Explicit Fixture Suggestions

**Files:**

- Create: `tools/review-evidence-console/public/src/models/normalize-suggestion.mjs`
- Modify: `tools/review-evidence-console/public/src/models/normalize-review.mjs`
- Modify JSON only: `tools/review-evidence-console/public/data/items/*.json`
- Regenerate: `tools/review-evidence-console/public/data/items/*.mjs`
- Create: `tools/review-evidence-console/tests/review-suggestion.test.mjs`
- Modify: `tools/review-evidence-console/tests/fixture-content.test.mjs`
- Modify: `tools/review-evidence-console/tests/fixture-repository.test.mjs`
- Modify: `tools/review-evidence-console/tests/validation-fixtures.mjs`

- [ ] **Step 1: Write all failing schema and exact-value tests**

Test missing/non-object suggestions; missing/blank common values; forbidden/unknown keys; non-object responses; unknown, wrong scalar/array, duplicate, invalid-option, blank-provided, unsafe, over-length, or conditionally inapplicable responses; date/response conflicts; duplicate/non-date date keys; invalid risk/severity; unsafe/over-length answer and reason; invalid/over-length top-level evidence reference; and repository `invalid_data` without fallback.

Use this exact contract:

```js
const evidenceRef = 'docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md';
const expected = {
  'M03A-PRIVACY-OWNER': {
    concreteAnswer: 'Kërko pronar të emërtuar të privatësisë ose ligjor para promovimit runtime.',
    reason: 'MOB-DG04 e shënon evidencën e pronarit si të munguar.',
    evidenceRef,
    riskCategory: 'legal',
    severity: 'high',
    responses: {
      ownerRole: 'Privacy / Legal owner',
      ownerEvidenceRef: evidenceRef,
      reviewerRole: 'privacy',
    },
    useSessionDateFor: ['verifiedAt', 'decisionDate'],
  },
  'M03A-MEDICAL-BOUNDARY': {
    concreteAnswer: 'Të dhënat mjekësore dhe të lëndimeve mbeten të përjashtuara.',
    reason: 'Nuk ka autoritet të nënshkruar ose të pranuar DPIA/Neni 9.',
    evidenceRef,
    riskCategory: 'privacy',
    severity: 'high',
    responses: {
      medicalBoundary: 'excluded',
      disabledScope:
        'Çaktivizo pranimin, shfaqjen, ngarkimin, ruajtjen dhe përpunimin e të dhënave mjekësore ose të lëndimeve.',
    },
    useSessionDateFor: ['verifiedAt'],
  },
  'M03A-CONSENT-FIELDS': {
    concreteAnswer: 'Prano vetëm metadata-t minimale të pëlqimit si kërkesë shqyrtimi.',
    reason: 'Fushat e pranuara nuk japin autoritet për schema ose runtime.',
    evidenceRef,
    riskCategory: 'compliance',
    severity: 'high',
    responses: {
      acceptedMinimumFields: ['consentStatus', 'recordedAt', 'consentVersion'],
      additions: 'Asnjë shtesë pa autoritet të ri.',
      excludedFields: 'Dokumente burimore dhe të dhëna mjekësore, ligjore private ose pagese.',
    },
    useSessionDateFor: ['verifiedAt'],
  },
  'M03A-ACCESS-ROLES': {
    concreteAnswer:
      'Lejo vetëm metadata të kufizuara për anëtarin dhe rolin e brendshëm të rastit.',
    reason: 'Qasja për sponsorin, paguesin dhe palët e jashtme nuk ka autoritet të pranuar.',
    evidenceRef,
    riskCategory: 'access',
    severity: 'high',
    responses: {
      memberDecision: 'view',
      internalCaseRoleDecision: 'view',
      sponsorDecision: 'exclude',
      payerDecision: 'exclude',
      externalPartyDecision: 'exclude',
    },
    useSessionDateFor: ['verifiedAt'],
  },
  'M03A-DOCUMENT-BOUNDARY': {
    concreteAnswer: 'Shfaq vetëm metadata; mos shfaq përmbajtjen e dokumentit burimor.',
    reason: 'Fixture-i duhet të ruajë kufirin e dokumenteve.',
    evidenceRef,
    riskCategory: 'privacy',
    severity: 'high',
    responses: {
      allowedMetadata: ['state', 'category', 'updatedAt'],
      forbiddenCategories: ['raw_document', 'payment', 'medical', 'legal_private'],
    },
    useSessionDateFor: ['verifiedAt'],
  },
  'M03A-THREAT-RECHECK': {
    concreteAnswer: 'Rikontrollo qasjen, ruajtjen dhe zbulimin para çdo promovimi runtime.',
    reason: 'Gate-i aktual e shënon provën e konsoliduar të kërcënimeve si të munguar.',
    evidenceRef,
    riskCategory: 'security',
    severity: 'high',
    responses: {
      threatAreas: ['access', 'retention', 'disclosure'],
      recheckOutcome: 'stop',
      threatRecheckEvidenceRef: evidenceRef,
    },
    useSessionDateFor: ['verifiedAt'],
  },
  'M03A-ERASURE-REVOCATION': {
    concreteAnswer: 'Fshih metadata-t pas fshirjes ose revokimit.',
    reason: 'Të dhënat e revokuara nuk duhet të mbeten të dukshme.',
    evidenceRef,
    riskCategory: 'privacy',
    severity: 'high',
    responses: { renderingRule: 'hide_metadata' },
    useSessionDateFor: ['verifiedAt'],
  },
  'M03A-SCOPE-STOPS': {
    concreteAnswer: 'Kufizo planifikimin te metadata jo-mjekësore për automjet dhe pronë.',
    reason: 'Runtime, të dhënat sensitive dhe zgjerimi i autoritetit mbeten jashtë fixture-it.',
    evidenceRef,
    riskCategory: 'scope',
    severity: 'high',
    responses: {
      allowedScope:
        'Vetëm planifikim i shfaqjes së metadata-ve për automjet dhe pronë, pa runtime.',
      excludedScope:
        'Të dhëna mjekësore ose lëndimesh, dokumente burimore, auth, schema, RLS dhe shkrues runtime.',
      stopCondition: 'missing_authority',
    },
    useSessionDateFor: ['verifiedAt'],
  },
};
```

Assert each normalized `item.suggestedReview` deep-equals its complete object above. `ownerDisplayName`, every decision, and every safety confirmation are absent.

- [ ] **Step 2: Verify RED.** Run `node --test tools/review-evidence-console/tests/review-suggestion.test.mjs`. Expected: FAIL because the normalizer and fixture contract do not exist.
- [ ] **Step 3: Implement the strict normalizer.** Keep `normalize-suggestion.mjs` under 150 lines. Allow only the spec keys; reuse safe-text/evidence guards, exact risk/severity/descriptor contracts, conditional applicability, and exact-key checks. Require a valid suggestion on every item. Add a minimal valid suggestion to `validation-fixtures.mjs`.
- [ ] **Step 4: Add JSON suggestions and generate modules.** Encode the exact values above in all eight JSON fixtures; edit no generated module by hand. Run `pnpm --dir tools/review-evidence-console run fixtures:generate`.
- [ ] **Step 5: Verify GREEN and all normalization regressions.** Run `pnpm --dir tools/review-evidence-console run test:unit` and `pnpm --dir tools/review-evidence-console run fixtures:check`. Expected: all tests pass and generated modules match JSON.
- [ ] **Step 6: Commit exact files.** Stage only the files listed in this chunk and commit `feat: define reviewer suggestion fixtures`.
