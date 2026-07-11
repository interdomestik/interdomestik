# Reviewer Contextual Default Notes Plan — Part 2

> Canonical plan index: [Reviewer Contextual Default Notes Implementation Plan](./2026-07-11-reviewer-contextual-default-notes.md)

## Chunk 2: Versioned note state and session behavior

### Task 3: Introduce a focused contextual-note state module

**Files:**

- Create: `tools/review-evidence-console/public/src/state/contextual-note-state.mjs`
- Create: `tools/review-evidence-console/tests/contextual-note-state.test.mjs`
- Modify: `tools/review-evidence-console/public/src/state/review-suggestions.mjs`
- Modify: `tools/review-evidence-console/tests/review-suggestions.test.mjs`
- Modify: `tools/review-evidence-console/tests/fixture-browser.spec.mjs`

- [ ] **Step 1: Record the baseline and write failing state/browser contracts**

Record `git rev-parse HEAD` as `<implementation-start-commit>`. Define unit tests for fresh version-2 initialization, version-1 migration, unversioned legacy initialization, exact custom restoration, dismissed tombstones, inactive conditional custom values, immutable returned snapshots, and unsupported-version rejection. Also add the desktop/mobile browser assertions from Task 7 now, before feature implementation.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/contextual-note-state.test.mjs tests/review-suggestions.test.mjs`

Run: `pnpm --dir tools/review-evidence-console test:browser`

Expected: both lanes FAIL because version 2, the sidecar module, and contextual defaults do not exist.

- [ ] **Step 3: Implement the pure state helpers**

Keep the new file under 150 lines. Export focused helpers equivalent to:

```js
export const SUGGESTION_VERSION = 2;
export function initializeContextualNotes(bundle, draft) {}
export function applyDecisionNote(item, decision, noteState) {}
export function updateContextualNote(item, fieldPath, value, noteState) {}
export function transitionConditionalNotes(item, previousResponses, nextResponses, noteState) {}
export function validateContextualNoteState(bundle, value) {}
```

Use only `unseen`, `suggested`, `custom`, and `dismissed`. Preserve exact safe custom conditional text while inactive; dismissed stores no value. Migration from version 1 maps blank contextual fields to `dismissed` and non-empty fields to `custom` without inserting new copy.

- [ ] **Step 4: Wire initialization and confirm GREEN**

Update `initializeSuggestedDecisions` to emit `suggestionVersion: 2`, retain the independent draft schema version, and attach the validated `contextualNoteState`. Do not change existing safe suggestions or fill manual fields.

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/contextual-note-state.test.mjs tests/review-suggestions.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit state initialization**

```bash
git add tools/review-evidence-console/public/src/state/contextual-note-state.mjs tools/review-evidence-console/public/src/state/review-suggestions.mjs tools/review-evidence-console/tests/contextual-note-state.test.mjs tools/review-evidence-console/tests/review-suggestions.test.mjs
git commit -m "feat: version contextual reviewer note state"
```

### Task 4: Apply defaults during reviewer interactions

**Files:**

- Modify: `tools/review-evidence-console/public/src/state/review-session-state.mjs`
- Modify: `tools/review-evidence-console/public/src/state/review-session.mjs`
- Modify: `tools/review-evidence-console/tests/review-session.test.mjs`
- Modify: `tools/review-evidence-console/tests/conditional-response-pruning.test.mjs`
- Modify: `tools/review-evidence-console/tests/review-session-identity.test.mjs`

- [ ] **Step 1: Write failing session-transition tests**

Prove: `change`/`block` reveals the default only for unseen/suggested empty notes; `approve` preserves draft note state; edit becomes custom; clear becomes dismissed; decision round-trips restore correctly; conditional deactivate/reactivate restores custom, keeps dismissed blank, or reapplies unseen/suggested; `dpiaRef` is never filled.

Inject a throwing contextual-note transition helper and prove failures during `setDecision` and `setResponse` are atomic: the exact prior snapshot remains current, no decision is selected, no response is pruned or replaced, and `onChange` is not called.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/review-session.test.mjs tests/conditional-response-pruning.test.mjs tests/review-session-identity.test.mjs`

Expected: FAIL on contextual transition assertions.

- [ ] **Step 3: Wire the pure helpers into session mutations**

Add `contextualNoteState` to `initialState`. In `setDecision`, transition `requestedChange` before committing. In `setField`, update the relevant note status when the field is contextual. In `setResponse`, retain contextual state before pruning, then restore/apply after applicability changes. Keep `onChange` and immutable snapshot behavior unchanged.

- [ ] **Step 4: Run focused and autosave tests**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/review-session.test.mjs tests/conditional-response-pruning.test.mjs tests/review-session-identity.test.mjs tests/autosave-controller.test.mjs tests/autosave-conflict.test.mjs`

Expected: PASS with unchanged conflict behavior.

- [ ] **Step 5: Commit interaction behavior**

```bash
git add tools/review-evidence-console/public/src/state/review-session-state.mjs tools/review-evidence-console/public/src/state/review-session.mjs tools/review-evidence-console/tests/review-session.test.mjs tools/review-evidence-console/tests/conditional-response-pruning.test.mjs tools/review-evidence-console/tests/review-session-identity.test.mjs
git commit -m "feat: apply contextual notes in review sessions"
```

### Task 5: Validate version-2 drafts fail closed

**Files:**

- Modify: `tools/review-evidence-console/public/src/state/draft-store.mjs`
- Create: `tools/review-evidence-console/public/src/state/draft-context-schema.mjs`
- Modify: `tools/review-evidence-console/public/src/app/workspace-runtime.mjs`
- Modify: `tools/review-evidence-console/public/src/app/validation-route.mjs`
- Modify: `tools/review-evidence-console/public/src/app/correction-controller.mjs`
- Modify: `tools/review-evidence-console/tests/draft-store.test.mjs`
- Modify: `tools/review-evidence-console/tests/canonical-storage-hardening.test.mjs`
- Modify: `tools/review-evidence-console/tests/workspace-runtime.test.mjs`
- Modify: `tools/review-evidence-console/tests/validation-route.test.mjs`
- Modify: `tools/review-evidence-console/tests/correction-controller.test.mjs`

- [ ] **Step 1: Write failing draft-validation tests**

Cover valid version 1 migration input, valid version 2 sidecars, unknown item/field/status, unsafe or oversized retained custom values, forbidden retained values on dismissed state, and unsupported suggestion versions. Expect existing `invalid_data` recovery results. In the three caller test files, add spies/fakes proving each runtime derives the contextual schema from its owned packet and passes it into every draft-store load/save path.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/draft-store.test.mjs tests/canonical-storage-hardening.test.mjs tests/workspace-runtime.test.mjs tests/validation-route.test.mjs tests/correction-controller.test.mjs`

Expected: FAIL because draft validation only accepts suggestion version 1, does not validate the sidecar, and callers do not yet provide a contextual schema.

- [ ] **Step 3: Add narrowly derived contextual schema validation at every store boundary**

Create `createDraftContextSchema(packet)` to derive only allowed item IDs, contextual field paths, descriptor limits, and safe conditional paths from an already owned/validated packet. Pass this schema into `createDraftStore` from `workspace-runtime.mjs`, `validation-route.mjs`, and `correction-controller.mjs`; update their focused tests to prove the same schema reaches load/save. Accept suggestion versions 1 and 2. Require `contextualNoteState` for version 2 and validate its strict shape against that schema before restoration. Preserve the existing draft `schemaVersion`, key parsing, conflict rules, and recovery messages. Extract validation helpers into `draft-context-schema.mjs` so `draft-store.mjs` does not exceed 150 lines.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/draft-store.test.mjs tests/canonical-storage-hardening.test.mjs tests/workspace-runtime.test.mjs tests/validation-route.test.mjs tests/correction-controller.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit persistence validation**

```bash
git add tools/review-evidence-console/public/src/state/draft-store.mjs tools/review-evidence-console/public/src/state/draft-context-schema.mjs tools/review-evidence-console/public/src/app/workspace-runtime.mjs tools/review-evidence-console/public/src/app/validation-route.mjs tools/review-evidence-console/public/src/app/correction-controller.mjs tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/canonical-storage-hardening.test.mjs tools/review-evidence-console/tests/workspace-runtime.test.mjs tools/review-evidence-console/tests/validation-route.test.mjs tools/review-evidence-console/tests/correction-controller.test.mjs
git commit -m "fix: validate contextual note drafts"
```
