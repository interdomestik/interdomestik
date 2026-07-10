# Task 9: Responsive And Accessibility Behavior

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 3: Responsive, Accessibility, And Repository Verification

### Task 9: Finish Responsive And Accessibility Behavior

**Files:**

- Create: `tools/review-evidence-console/public/styles/responsive.css`
- Modify: `tools/review-evidence-console/public/index.html`
- Modify: `tools/review-evidence-console/public/src/app.mjs`
- Modify: `tools/review-evidence-console/public/src/views/workspace.mjs`
- Modify: `tools/review-evidence-console/public/src/views/validation.mjs`
- Modify: `tools/review-evidence-console/public/src/views/receipt.mjs`

- [ ] **Step 1: Add tablet and mobile layout rules**

At tablet width, move evidence into a side sheet. At mobile width, stack the packet stepper above the decision, use a sticky `Save & continue` bar, preserve 44px targets, and remove all horizontal page overflow.

- [ ] **Step 2: Add reduced-motion and zoom rules**

Disable transitions under `prefers-reduced-motion: reduce`. Use fluid sizing and wrapping so 320px width and 200% browser zoom remain usable.

- [ ] **Step 3: Add focus management and live regions**

Move focus to the view heading after route changes, to the first invalid control after validation navigation, and to the receipt heading after submission. Announce autosave, import, export, validation, and local-data deletion results.

- [ ] **Step 4: Run keyboard and responsive browser proof**

Use the in-app Browser and its viewport control at `1440x1000`, `1024x768`, `390x844`, and `320x720`, then repeat the 320px workflow at 200% zoom and WCAG text spacing. Verify measured 44px targets, no horizontal overflow, semantic landmarks/headings/labels, keyboard order, focus entry/return, live-region announcements, reduced motion, and automated WCAG 2.2 AA results.

- all actions are reachable in a logical Tab order;
- focus is visible;
- status remains understandable without color;
- no content clips or scrolls horizontally;
- the sticky action bar does not cover fields;
- reduced-motion mode removes nonessential transitions;
- browser logs contain no errors or warnings.

- [ ] **Step 5: Commit responsive and accessibility behavior**

```bash
git add tools/review-evidence-console/public/styles/responsive.css tools/review-evidence-console/public/index.html tools/review-evidence-console/public/src
git commit -m "feat: polish reviewer console accessibility"
```
