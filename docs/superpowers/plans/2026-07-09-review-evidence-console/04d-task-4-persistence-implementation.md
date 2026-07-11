# Task 4D: Persistence Implementation And Checkpoint

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

- [ ] **Step 4: Run state tests and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
```

Expected: FAIL because state modules do not exist.

- [ ] **Step 5: Implement canonical JSON and receipt building**

Recursively sort object keys, preserve array order, use the injected `submittedAt` or call an injected `now()` once, aggregate the highest severity, hash canonical UTF-8 bytes through `crypto.subtle`, and prefix the first 24 hex characters with `rec_`. Deep-freeze the returned receipt object and verify its canonical hash on load, export, and import; add a nested-mutation corruption test.

- [ ] **Step 6: Implement injected storage adapters**

Both stores accept `{ storage = globalThis.localStorage }`. Catch browser exceptions and return stable results. Draft recovery exports the untouched draft, not a receipt. Receipt import accepts JSON text only; file reading remains a view concern.

- [ ] **Step 7: Run state tests and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
```

Expected: `21` tests pass with `0` failures.

- [ ] **Step 8: Commit persistence**

```bash
git add tools/review-evidence-console/public/src/state tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
git commit -m "feat: persist reviewer drafts and receipts"
```

### Chunk 1 Integration Checkpoint

- [ ] **Run every Chunk 1 test together**

```bash
node --test tools/review-evidence-console/tests/server.test.mjs tools/review-evidence-console/tests/fixture-repository.test.mjs tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
```

Expected: `56` tests pass with `0` failures.

- [ ] **Enforce modularity limits**

```bash
rg --files tools/review-evidence-console | rg '\.(mjs|css)$' | xargs wc -l | awk '$2 != "total" && $1 > 150 { print; bad=1 } END { exit bad }'
rg --files tools/review-evidence-console/public/data/packets | xargs wc -l | awk '$2 != "total" && $1 > 200 { print; bad=1 } END { exit bad }'
```

Expected: both commands exit `0` and print no violating file.

---
