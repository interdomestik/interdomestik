# Task 11: Albanian-First Reviewer Workflow

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 11: Localize Display Copy Without Changing Canonical Data

**Files:**

- Modify: `tools/review-evidence-console/public/index.html`
- Modify JSON only: `tools/review-evidence-console/public/data/{reviewers,assignments}.json`
- Modify JSON only: `tools/review-evidence-console/public/data/items/*.json`
- Modify JSON only: `tools/review-evidence-console/public/data/packets/*.json`
- Regenerate: matching `tools/review-evidence-console/public/data/**/*.mjs`
- Create: `tools/review-evidence-console/public/src/components/display-labels.mjs`
- Create: `tools/review-evidence-console/public/src/app/receipt-confirmation.mjs`
- Modify: `tools/review-evidence-console/public/src/models/normalize-descriptor.mjs`
- Modify: `tools/review-evidence-console/public/src/components/{decision,evidence-rail,form-field,packet-rail,recovery-notice,status}.mjs`
- Modify: `tools/review-evidence-console/public/src/views/{inbox,workspace,validation,receipt,correction}.mjs`
- Modify: `tools/review-evidence-console/public/src/app/{autosave-controller,correction-controller,receipt-io,result-fallback,review-routes,submission-controller,workspace-runtime}.mjs`
- Modify: `tools/review-evidence-console/public/src/data/fixture-repository.mjs`
- Modify: `tools/review-evidence-console/public/src/validation/{input-guards,item,packet}.mjs`
- Modify: `tools/review-evidence-console/public/src/state/{draft-store,receipt-schema,receipt-store,storage-results}.mjs`
- Create: `tools/review-evidence-console/tests/{albanian-copy,display-labels}.test.mjs`
- Create: `tools/review-evidence-console/tests/workspace-albanian.test.mjs`
- Modify: `tools/review-evidence-console/tests/{fixture-descriptor-validation,fixture-content,inbox-import,validation-view,receipt-view,review-correction,autosave-controller,receipt-io,submission-controller,receipt-import-identity,receipt-integrity}.test.mjs`

Keep new tests/helpers below 150 lines. Extract localized clear confirmation from the 150-line `review-routes.mjs` into `receipt-confirmation.mjs` so the route file ends below 150 lines. Put new workspace localization assertions in `workspace-albanian.test.mjs`; do not grow the existing 150-line `workspace.test.mjs`. Do not grow `decision.mjs` beyond its current focused responsibility.

- [ ] **Step 1: Write both failing language tests**

Assert the existing `lang="sq"` remains, the title includes `Konsola e shqyrtimit dhe evidencës`, the eight Albanian headings render with copyable canonical IDs, accessible names equal visible Albanian actions, and every allowed English phrase has `lang="en"`.

Test this pure label API and secondary raw-code rendering:

```js
assert.equal(displayDecision('approve'), 'Mirato');
assert.equal(displaySeverity('high'), 'E lartë');
assert.deepEqual(displayOption(descriptor, 'excluded'), {
  label: 'Përjashto',
  value: 'excluded',
});
```

Before implementation, add descriptor exact-label-map rejection tests and characterization assertions for canonical `authorityDisclaimer`, fixed-time canonical JSON/receipt ID, import identity, raw enum values, and correction ancestry. Characterization may pass in RED; the new language/label assertions must fail for the expected missing behavior.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/albanian-copy.test.mjs tools/review-evidence-console/tests/display-labels.test.mjs tools/review-evidence-console/tests/workspace-albanian.test.mjs tools/review-evidence-console/tests/fixture-descriptor-validation.test.mjs tools/review-evidence-console/tests/receipt-view.test.mjs tools/review-evidence-console/tests/submission-controller.test.mjs tools/review-evidence-console/tests/receipt-import-identity.test.mjs tools/review-evidence-console/tests/receipt-integrity.test.mjs tools/review-evidence-console/tests/review-correction.test.mjs
```

Expected: FAIL on the English title/copy, missing option-label contract, missing label module, and missing `lang="en"` markup for retained technical English.

- [ ] **Step 3: Translate authoritative JSON and generate modules**

Translate packet title/scope/stop conditions, item prompt/need/repo impact/guidance, reviewer/assignment display copy, and descriptor labels. Add `optionLabelsSq` whose exact key set equals `options`; reject missing, extra, duplicate, or empty labels. Edit no generated `.mjs` by hand.

Run:

```bash
pnpm --dir tools/review-evidence-console run fixtures:generate
```

- [ ] **Step 4: Localize UI and validation copy**

Implement `displayDecision`, `displayRisk`, `displaySeverity`, and `displayOption`. Render Albanian labels first and raw enum codes as secondary `<code lang="en">` text. Translate all user-facing actions, statuses, validation/store errors, receipt/import/correction copy, accessible names, live regions, and confirmations in the exact files listed above.

- [ ] **Step 5: Prove display/canonical separation**

In `receipt-view.test.mjs`, prove Albanian labels and the derived Albanian disclaimer render. In `submission-controller.test.mjs`, keep the existing canonical `authorityDisclaimer`. With fixed `submittedAt`, assert unchanged canonical JSON, raw decision/response enums, receipt ID, import identity, and correction ancestry in the receipt integrity/import/correction tests.

- [ ] **Step 6: Verify GREEN and fixture parity**

Run:

```bash
pnpm --dir tools/review-evidence-console run test:unit
pnpm --dir tools/review-evidence-console run fixtures:check
```

Expected: all unit tests pass and JSON/MJS parity is clean.

- [ ] **Step 7: Browser accessibility proof**

At 1440x1000, 1024x768, 390x844, 320x720, and 200% zoom, verify inbox, workspace, validation, receipt, import, and correction. Prove keyboard order, visible focus, matching accessible names, copyable canonical IDs, Albanian labels plus raw audit codes, and clean browser logs.

- [ ] **Step 8: Commit exact files**

Stage only the exact modified/created files from this chunk and commit:

```bash
git add tools/review-evidence-console/public/index.html \
  tools/review-evidence-console/public/data/reviewers.{json,mjs} \
  tools/review-evidence-console/public/data/assignments.{json,mjs} \
  tools/review-evidence-console/public/data/items/*.{json,mjs} \
  tools/review-evidence-console/public/data/packets/*.{json,mjs} \
  tools/review-evidence-console/public/src/components/{display-labels,decision,evidence-rail,form-field,packet-rail,recovery-notice,status}.mjs \
  tools/review-evidence-console/public/src/models/normalize-descriptor.mjs \
  tools/review-evidence-console/public/src/views/{inbox,workspace,validation,receipt,correction}.mjs \
  tools/review-evidence-console/public/src/app/{autosave-controller,correction-controller,receipt-confirmation,receipt-io,result-fallback,review-routes,submission-controller,workspace-runtime}.mjs \
  tools/review-evidence-console/public/src/data/fixture-repository.mjs \
  tools/review-evidence-console/public/src/validation/{input-guards,item,packet}.mjs \
  tools/review-evidence-console/public/src/state/{draft-store,receipt-schema,receipt-store,storage-results}.mjs \
  tools/review-evidence-console/tests/{albanian-copy,display-labels,workspace-albanian,fixture-descriptor-validation,fixture-content,inbox-import,validation-view,receipt-view,review-correction,autosave-controller,receipt-io,submission-controller,receipt-import-identity,receipt-integrity}.test.mjs
git commit -m "feat: localize reviewer console in Albanian"
```

Task 12C reruns the complete console and Phase C verification after all later suggestion changes.
