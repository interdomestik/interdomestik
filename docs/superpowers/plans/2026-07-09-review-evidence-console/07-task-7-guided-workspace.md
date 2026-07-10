# Task 7: Guided Review Workspace

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 7: Build The Guided Review Workspace

**Files:**

- Create: `tools/review-evidence-console/public/src/components/packet-rail.mjs`
- Create: `tools/review-evidence-console/public/src/components/decision.mjs`
- Create: `tools/review-evidence-console/public/src/views/workspace.mjs`
- Modify: `tools/review-evidence-console/public/src/app.mjs`
- Modify: `tools/review-evidence-console/public/styles/layout.css`
- Modify: `tools/review-evidence-console/public/styles/components.css`

- [ ] **Step 1: Render packet scope and progress**

The packet rail must show ordered items, `Not started`, `In review`, `Needs change`, `Blocked`, or `Complete` text, and the non-medical scope guard. Clicking an item updates the hash route and moves focus to the item heading.

- [ ] **Step 2: Render the current prompt and guidance**

Show canonical item ID, Albanian prompt, need, repo impact, and the separated system-guidance panel. `Use as a starting point` copies guidance into answer/reason fields only.

- [ ] **Step 3: Render explicit decision controls**

Use a native radio group for `Mirato`, `Kërkon ndryshim`, and `Blloko`. Start with no selected option. Render base fields and descriptor-specific controls from `requiredResponses`; do not hard-code MOB-03a form rows in the view.

- [ ] **Step 4: Render the evidence rail and autosave states**

Keep evidence reference, verification date, risk category, severity, and repo-safe acknowledgement beside the decision on desktop. Debounce draft saves, announce saving/saved/failure states, and stop autosave on a tab conflict.

The acknowledgement is one packet-level control, persisted once in the draft and passed once to `validatePacket`. Add focused tests for corrupt/schema-mismatched recovery export, explicit draft deletion, quota errors, and `storage` event conflict detection.

- [ ] **Step 5: Verify one item flow in the browser**

With Browser/Playwright MCP:

1. Open Part A.
2. Select `Consent fields`.
3. Confirm no decision is selected.
4. Use guidance and confirm the decision remains unset.
5. Choose `Approve`, fill the evidence reference, and save.
6. Reload and confirm the draft returns to the same item.

Expected: all values persist, focus remains logical, and no console error or warning appears.

- [ ] **Step 6: Commit the workspace**

```bash
git add tools/review-evidence-console/public/src/components tools/review-evidence-console/public/src/views/workspace.mjs tools/review-evidence-console/public/src/app.mjs tools/review-evidence-console/public/styles
git commit -m "feat: add guided evidence review"
```
