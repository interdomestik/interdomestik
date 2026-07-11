# Task 12C: Reviewer Suggestion UX And Receipt Proof

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 12C: Explain Suggestions And Preserve Canonical Receipts

**Files:**

- Modify: `tools/review-evidence-console/public/src/views/workspace.mjs`
- Modify: `tools/review-evidence-console/public/src/state/receipt-schema.mjs`
- Modify: `tools/review-evidence-console/public/styles/workspace.css`
- Modify: `tools/review-evidence-console/tests/{workspace,receipt-builder,receipt-integrity,receipt-import-identity,receipt-store}.test.mjs`
- Modify: `tools/review-evidence-console/tests/fixture-browser.spec.mjs`

- [ ] **Step 1: Write failing DOM, receipt, and browser tests first**

Assert exactly one `role="note"` with `Sugjerime të paraplotësuara — verifikoji dhe ndryshoji para dërgimit.` appears before `.decision-form`. Assert decision radios and safe-evidence checkbox remain unchecked.

Add a build test proving those input fields are omitted by the existing whitelist. Add verify, import, correction, and write-once tests that reject `suggestionVersion`, `suggestedReview`, or `useSessionDateFor` at receipt top level, even after canonical rehashing.

Add desktop/mobile browser coverage: edit a suggestion, clear another, reload, verify both values persist, confirm manual controls remain unchecked, complete review, and prove only final values appear in the receipt.

- [ ] **Step 2: Verify RED including the browser path**

Run:

```bash
node --test tools/review-evidence-console/tests/workspace.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-integrity.test.mjs tools/review-evidence-console/tests/receipt-import-identity.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
pnpm --dir tools/review-evidence-console run test:browser
```

Expected: unit FAIL on the missing note/schema exclusions while the build-omission characterization passes; browser FAIL on missing editable-default behavior.

- [ ] **Step 3: Implement the narrow UX and receipt exclusions**

Render the single note before the decision form. Use existing info/warning tokens, AA contrast, no animation, and no per-field provenance state. In `receipt-schema.mjs`, reject the three forbidden suggestion metadata keys before hash/import/correction handling.

- [ ] **Step 4: Verify focused GREEN**

Run the Step 2 commands again. Expected: all focused unit and browser tests pass.

- [ ] **Step 5: Run complete console, scope, modularity, and Phase C gates**

Run:

```bash
pnpm --dir tools/review-evidence-console run verify
pnpm check:modularity-guard
node scripts/repo-size-budget-sync.mjs --check
pnpm repo:size:check
pnpm slice:verify
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Use `interdomestik_qa` scope audit with allowed paths `tools/review-evidence-console`, approved spec/plan paths, and measured size budget only. Record any unrelated environment failure without widening scope.

- [ ] **Step 6: Commit exact files**

Stage only the files listed in this chunk and any measured `scripts/repo-size-budget.json` update, then commit `feat: explain editable reviewer suggestions`.
