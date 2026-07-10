# Reviewer Contextual Default Notes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill safe, item-specific Albanian reviewer notes while preserving manual decisions, reviewer edits, draft history, and receipt integrity.

**Architecture:** Fixture data owns the copy; strict normalization validates it; a focused contextual-note state module owns versioned state and transitions. The existing session orchestrator calls that module on decision and conditional-response changes, while draft validation and receipt tests enforce fail-closed persistence and metadata isolation.

**Tech Stack:** Browser-native ES modules, Node.js test runner, localStorage draft persistence, Playwright browser tests, JSON/MJS fixture generation.

**Approved design:** `docs/superpowers/specs/2026-07-11-reviewer-contextual-default-notes-design.md`

---

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

## Chunk 3: Receipt isolation, browser proof, and gates

### Task 6: Keep contextual metadata out of receipts

**Files:**

- Modify: `tools/review-evidence-console/public/src/state/receipt-builder.mjs`
- Modify: `tools/review-evidence-console/tests/receipt-builder.test.mjs`
- Modify: `tools/review-evidence-console/tests/receipt-nested-metadata.test.mjs`
- Modify: `tools/review-evidence-console/tests/receipt-structured-responses.test.mjs`

- [ ] **Step 1: Write failing receipt-boundary tests**

Assert approve decisions omit the `requestedChange` key entirely; change/block include only applicable reviewer-visible text; and recursive scans find no `suggestionVersion`, `contextualNoteState`, status, or retained sidecar value anywhere in a receipt.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/receipt-builder.test.mjs tests/receipt-nested-metadata.test.mjs tests/receipt-structured-responses.test.mjs`

Expected: FAIL where approve currently serializes an empty `requestedChange` or metadata leaks through input.

- [ ] **Step 3: Canonicalize receipt decisions explicitly**

Build each receipt decision from the allowed receipt fields rather than spreading draft/session state. Include `requestedChange` only for `change` or `block` when non-empty and applicable. Continue pruning inapplicable structured responses.

- [ ] **Step 4: Run all receipt tests**

Run: `pnpm --dir tools/review-evidence-console exec node --test tests/receipt-*.test.mjs`

Expected: PASS with stable hash verification.

- [ ] **Step 5: Commit receipt isolation**

```bash
git add tools/review-evidence-console/public/src/state/receipt-builder.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-nested-metadata.test.mjs tools/review-evidence-console/tests/receipt-structured-responses.test.mjs
git commit -m "fix: isolate contextual notes from receipts"
```

### Task 7: Make the prewritten browser contract pass on desktop and mobile

**Files:**

- Modify: `tools/review-evidence-console/tests/fixture-browser.spec.mjs`
- Modify only if an accessible explanatory label is absent: `tools/review-evidence-console/public/src/views/workspace.mjs`
- Modify only if required for the existing label: `tools/review-evidence-console/tests/workspace-albanian.test.mjs`

- [ ] **Step 1: Confirm the prewritten browser contract still fails for the expected reason**

The contract added before implementation verifies at the existing desktop viewport and a mobile viewport that selecting `change` shows the exact recommendation; the textarea is editable and clearable; clearing survives decision round-trips; the final decision starts unselected; the safe-evidence checkbox starts unchecked; `ownerDisplayName` and `dpiaRef` remain blank.

- [ ] **Step 2: Run the browser test and confirm RED**

Use the already approved repository Playwright lane:

Run: `pnpm --dir tools/review-evidence-console test:browser`

Expected: FAIL only on missing contextual behavior or the single explanatory label. If it already passes, stop and inspect whether the test actually exercises fresh state, editing, clearing, reload, and decision round-trips before proceeding.

- [ ] **Step 3: Add only the minimal Albanian explanatory label if needed**

Use presentation copy equivalent to: `Disa shënime janë sugjeruar për ta përshpejtuar shqyrtimin; mund t’i ndryshoni ose t’i hiqni.` Do not add a new page, dialog, workflow step, or visual redesign.

- [ ] **Step 4: Run unit and browser suites**

Run: `pnpm --dir tools/review-evidence-console fixtures:check`

Run: `pnpm --dir tools/review-evidence-console test:unit`

Run: `pnpm --dir tools/review-evidence-console test:browser`

Expected: all console tests PASS at desktop and mobile states.

- [ ] **Step 5: Commit browser proof**

```bash
git add tools/review-evidence-console/tests/fixture-browser.spec.mjs tools/review-evidence-console/public/src/views/workspace.mjs tools/review-evidence-console/tests/workspace-albanian.test.mjs
git commit -m "test: prove editable Albanian review defaults"
```

### Task 8: Run repository-required verification without touching paused deployment work

**Files:**

- No expected code changes.
- Preserve existing unrelated modifications in `docs/plans/current-program.md`, `docs/plans/current-tracker.md`, `scripts/repo-size-budget.json`, the REC-DG02 authority draft, middleware, and middleware tests.

- [ ] **Step 1: Inspect the final diff and file sizes**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff --name-only <implementation-start-commit>...HEAD | rg '^tools/review-evidence-console/public/src/.*\.mjs$' | while read -r file; do wc -l "$file"; done`

Expected: no whitespace errors; every touched production module is under 150 lines. If any touched legacy file would exceed 150 lines, extract a focused helper before adding behavior. Paused deployment changes remain intact and unstaged unless already owned by their earlier work.

- [ ] **Step 2: Run console verification**

Run: `pnpm --dir tools/review-evidence-console verify`

Expected: PASS.

- [ ] **Step 3: Run repository gates**

Run: `pnpm pr:verify`

Run: `pnpm security:guard`

Run: `pnpm e2e:gate`

Expected: PASS, or report the exact pre-existing/environmental blocker without changing production routes or unrelated files.

- [ ] **Step 4: Perform a final scope audit**

Run: `git diff --name-only <implementation-start-commit>...HEAD`

Expected: feature commits touch only `tools/review-evidence-console/` plus this approved spec/plan documentation. Deployment remains a separate, paused follow-up.

- [ ] **Step 5: Request independent code review before promotion**

Use `requesting-code-review` against the implementation commit range. Resolve only findings inside this feature scope, rerun affected tests, and record the final disposition before any deployment work resumes.
