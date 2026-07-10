# Task 8: Validation, Receipts, Import, And Corrections

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 8: Add Validation, Receipts, Import, And Corrections

**Files:**

- Create: `tools/review-evidence-console/public/src/views/validation.mjs`
- Create: `tools/review-evidence-console/public/src/views/receipt.mjs`
- Modify: `tools/review-evidence-console/public/src/app.mjs`
- Modify: `tools/review-evidence-console/public/src/components/status.mjs`
- Modify: `tools/review-evidence-console/public/styles/components.css`

- [ ] **Step 1: Render grouped packet validation**

Show every incomplete item with its missing fields. Selecting an error navigates to the item and focuses the first invalid control. Validation failure preserves the draft.

- [ ] **Step 2: Submit and persist a receipt**

Disable duplicate submit actions while `buildReceipt` runs. Save through `ReceiptStore` before rendering the receipt. Show receipt ID, version, reviewer display name and fixture role, timestamp, risk summary, decisions, evidence references, and the authority disclaimer.

- [ ] **Step 3: Add JSON export and copy fallback**

Export canonical receipt JSON as `<receiptId>.json`. If browser download creation fails, display a read-only textarea and `Copy receipt JSON` action with a live-region result.

- [ ] **Step 4: Add local receipt import**

Use `<input type="file" accept="application/json,.json">`, explicitly reject non-`.json` filenames and files over 1 MiB before `File.text()`, and pass JSON text plus expected packet, assignment, reviewer, and role metadata to `ReceiptStore.import`. The UI must state `Read on this device; never uploaded`.

- [ ] **Step 5: Add correction entry**

From a stored or imported receipt, choose one item, enter correction reason and impact, then create a new review session. Submission must increment `receiptVersion` and preserve `previousReceiptId`.

- [ ] **Step 6: Verify receipt reload and correction flow**

With Browser/Playwright MCP:

1. Complete all four Part A items.
2. Submit and record the receipt ID.
3. Reload and reopen the receipt.
4. Export, clear only receipts, and import the JSON again.
5. Start a correction for `Access roles`.
6. Submit the correction and confirm version `2` plus the original receipt link.

Expected: application-level write-once, tamper-evident version history, no network request for import, and no browser errors or warnings.

- [ ] **Step 7: Commit validation and receipts**

```bash
git add tools/review-evidence-console/public/src/views tools/review-evidence-console/public/src/app.mjs tools/review-evidence-console/public/src/components/status.mjs tools/review-evidence-console/public/styles/components.css
git commit -m "feat: complete reviewer evidence workflow"
```

---
