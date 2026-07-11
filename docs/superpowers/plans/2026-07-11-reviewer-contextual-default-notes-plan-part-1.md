# Reviewer Contextual Default Notes Plan — Part 1

> Canonical plan index: [Reviewer Contextual Default Notes Implementation Plan](./2026-07-11-reviewer-contextual-default-notes.md)

## Chunk 1: Fixture and normalization contract

### Task 1: Add exact Albanian contextual recommendations

**Files:**

- Modify: `tools/review-evidence-console/public/data/items/m03a-*.json`
- Generate: `tools/review-evidence-console/public/data/items/m03a-*.mjs`
- Modify: `tools/review-evidence-console/tests/fixture-content.test.mjs`
- Modify: `tools/review-evidence-console/tests/fixture-module-parity.test.mjs`

- [ ] **Step 1: Write failing fixture-content assertions**

Add a table-driven test containing the eight exact `requestedChange` strings from the approved design and the erasure-only `conditionalResponses.retentionNote` string. Assert every item matches exactly and all other items omit `conditionalResponses`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/fixture-content.test.mjs tests/fixture-module-parity.test.mjs`

Expected: FAIL because the fixture suggestions do not yet expose the new keys.

- [ ] **Step 3: Add the approved fixture copy**

Add this shape to each JSON fixture without changing unrelated evidence data:

```json
{
  "suggestedReview": {
    "requestedChange": "<exact approved Albanian item recommendation>"
  }
}
```

For `M03A-ERASURE-REVOCATION` only, also add:

```json
{
  "conditionalResponses": {
    "retentionNote": "Shfaq vetëm statusin e revokuar dhe afatin e dokumentuar të ruajtjes; mos shfaq metadata të tjera."
  }
}
```

- [ ] **Step 4: Regenerate fixture modules and confirm GREEN**

Run: `pnpm --dir tools/review-evidence-console fixtures:generate`

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/fixture-content.test.mjs tests/fixture-module-parity.test.mjs`

Expected: generated MJS equals JSON and focused tests PASS.

- [ ] **Step 5: Commit the fixture contract**

```bash
git add tools/review-evidence-console/public/data/items tools/review-evidence-console/tests/fixture-content.test.mjs tools/review-evidence-console/tests/fixture-module-parity.test.mjs
git commit -m "feat: add Albanian contextual review notes"
```

### Task 2: Validate the extended suggestion contract strictly

**Files:**

- Modify: `tools/review-evidence-console/public/src/models/normalize-suggestion.mjs`
- Modify: `tools/review-evidence-console/tests/review-suggestion.test.mjs`
- Modify: `tools/review-evidence-console/tests/reviewer-suggestion-boundaries.test.mjs`

- [ ] **Step 1: Write failing normalization tests**

Cover: required `requestedChange`; optional exact-object `conditionalResponses`; unknown keys; empty/unsafe/over-limit values; non-conditional keys; non-text descriptors; identity fields; and `evidenceRef` descriptors. Assert valid values are cloned into normalized output.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/review-suggestion.test.mjs tests/reviewer-suggestion-boundaries.test.mjs`

Expected: FAIL on the new contract assertions.

- [ ] **Step 3: Implement minimal strict normalization**

Extend the exact top-level field list with `requestedChange` and `conditionalResponses`. Normalize `requestedChange` through `safeText(..., 2000)`. Validate conditional entries against `requiredResponses` and accept only descriptors whose type is `text` or `textarea`, whose `requiredWhen` exists, and whose key is neither identity-bearing nor an evidence reference. Return a newly allocated object and omit `conditionalResponses` when absent.

- [ ] **Step 4: Run focused tests and fixture checks**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/review-suggestion.test.mjs tests/reviewer-suggestion-boundaries.test.mjs`

Run: `pnpm --dir tools/review-evidence-console fixtures:check`

Expected: PASS.

- [ ] **Step 5: Commit normalization**

```bash
git add tools/review-evidence-console/public/src/models/normalize-suggestion.mjs tools/review-evidence-console/tests/review-suggestion.test.mjs tools/review-evidence-console/tests/reviewer-suggestion-boundaries.test.mjs
git commit -m "feat: validate contextual review suggestions"
```
