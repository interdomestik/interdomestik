# Reviewer Contextual Default Notes Plan — Part 3

> Canonical plan index: [Reviewer Contextual Default Notes Implementation Plan](./2026-07-11-reviewer-contextual-default-notes.md)

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
