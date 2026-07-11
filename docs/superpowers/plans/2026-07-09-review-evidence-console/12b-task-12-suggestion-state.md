# Task 12B: Reviewer Suggestion Session State

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 12B: Apply Suggestions Once Without Overwriting Reviewers

**Files:**

- Create: `tools/review-evidence-console/public/src/state/review-suggestions.mjs`
- Modify: `tools/review-evidence-console/public/src/state/{draft-store,review-session-state,review-session}.mjs`
- Modify: `tools/review-evidence-console/public/src/app/{workspace-runtime,correction-controller}.mjs`
- Create: `tools/review-evidence-console/tests/review-suggestions.test.mjs`
- Modify: `tools/review-evidence-console/tests/{draft-store,review-correction,correction-controller,workspace-runtime}.test.mjs`

- [ ] **Step 1: Write every failing precedence/runtime test first**

Cover fresh defaults; version-1 exact restore; legacy absent-only top-level and nested response fill; blank string/array preservation; one migration save; no version-1 rewrite; unsupported `suggestionVersion: 2` recovery; manual decision/requested-change/safety controls; and these date call counts:

- fresh/legacy: exactly one `getLocalDate()` call;
- version-1 restore/correction: zero calls.

Test the pure API:

```js
const result = initializeSuggestedDecisions(bundle, draft, {
  getLocalDate: () => '2026-07-10',
});
assert.equal(result.suggestionVersion, 1);
```

Write the correction-controller test first: it must call `createReviewSession` with suggestions disabled, then seed receipt decisions/responses unchanged. Assert correction saves `safeEvidenceConfirmed: false` so the reviewer must reconfirm repo-safe evidence.

- [ ] **Step 2: Verify RED across state, store, runtime, and correction**

Run:

```bash
node --test tools/review-evidence-console/tests/review-suggestions.test.mjs tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/review-correction.test.mjs tools/review-evidence-console/tests/correction-controller.test.mjs tools/review-evidence-console/tests/workspace-runtime.test.mjs
```

Expected: FAIL on missing initializer, unsupported-version acceptance, missing migration save, and correction suggestion initialization.

- [ ] **Step 3: Implement deterministic initialization**

Keep the pure helper under 150 lines. Validate the injected `YYYY-MM-DD`, call it once only when suggestions must be applied, implement exact own-property semantics, and return version 1. Add an explicit `applySuggestions: false` session option that bypasses the helper and never calls the date dependency.

- [ ] **Step 4: Integrate draft compatibility and autosave**

Accept only absent legacy version or integer version 1 in `draft-store.mjs`; return `invalid_data` for other owned versions. When an unsupported version loads, show recovery and do not initialize suggestions or schedule a fresh/migration save. Persist one fresh/legacy version-1 draft after autosave exists. Preserve restored version-1 drafts byte-for-behavior without scheduling a rewrite.

- [ ] **Step 5: Integrate correction before suggestions**

In `startCorrection`, create the session with `applySuggestions: false`, then call `createCorrection`. Prove the receipt values win unchanged, `safeEvidenceConfirmed` is false, and the saved correction draft contains version 1 only as draft metadata.

- [ ] **Step 6: Verify GREEN**

Run the Step 2 command again. Expected: all focused tests pass.

- [ ] **Step 7: Commit exact files**

Stage only the files listed in this chunk and commit `feat: apply reviewer suggestions safely`.
