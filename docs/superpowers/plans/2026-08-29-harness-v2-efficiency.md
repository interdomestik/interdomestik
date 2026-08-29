# Harness V2 Efficiency Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic read-only slice rehearsal and telemetry summary that expose all known operational deficits before approval and derive one bounded approval envelope.

**Architecture:** A pure rehearsal core validates a closed manifest, aggregates capacity/modularity/topology/evidence consequences, and performs fixed-point v2 repo-size derivation without writing. A thin Git/CLI adapter gathers local facts. A separate pure telemetry command summarizes three-slice efficiency data. Existing authority, CI, security, repo-size, and evidence-reuse contracts remain authoritative.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, Git CLI at `/usr/bin/git`, existing repo-size capacity schema/evaluator, canonical JSON + SHA-256.

## Final Implementation Record

The implementation was completed as one integrated local branch with parallel subagent ownership,
followed by a single exact-tree audit. The final surface is intentionally broader than the initial
file sketch because cohesion and focused-test caps were rehearsed before attribution:

- closed manifest, repository facts, writer policy, capacity fixed point, projection repair, and
  approval-envelope modules;
- exact/deferred sensitive-operation contracts with executable predicates;
- prevention-first prerequisite sequencing before projection-only closeout; exact-head force is
  exceptional rather than part of the normal path;
- protected GitHub PR-E2E evidence discovery and exact-identity reuse;
- overflow-safe observational telemetry;
- a dedicated `test:harness-v2` command wired into the lightweight CI audit;
- one exact named repo-size allocation covering the complete writer map.

No product slice, successor, provider, deployment, Docker, or authority mutation is part of this
implementation. The task is complete only after the real self-rehearsal exits zero, all repository
safety checks pass, and both final auditors approve the same staged tree.

---

## Chunk 1: Rehearsal Contract And Pure Core

### Task 1: Lock the closed manifest and report schemas

**Files:**

- Create: `scripts/slice-rehearse-core.mjs`
- Create: `scripts/slice-rehearse.test.mjs`
- Reference: `scripts/repo-size-capacity-schema.mjs`
- Reference: `scripts/modularity-guard-policy.mjs`

- [ ] **Step 1: Write failing tests for exact manifest keys**

Test a minimal valid manifest and reject missing/extra keys, unsafe paths, duplicate writers,
unknown operations, invalid SHA/origin, category mismatch, negative limits, and a path plan that does
not equal the writer map.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/slice-rehearse.test.mjs`

Expected: FAIL because `slice-rehearse-core.mjs` does not exist.

- [ ] **Step 3: Implement manifest validation**

Export:

```js
export const ROUTINE_OPERATIONS = Object.freeze([...]);
export function validateRehearsalManifest(value) {}
export function canonicalJson(value) {}
export function sha256(value) {}
```

Use exact-key checks, POSIX repo-relative paths, sorted unique writers, SHA-40 validation, and the
existing six repo-size categories.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/slice-rehearse.test.mjs`

Expected: PASS for schema cases.

- [ ] **Step 5: Commit the schema checkpoint**

```bash
git add scripts/slice-rehearse-core.mjs scripts/slice-rehearse.test.mjs
git commit -m "feat(harness): define rehearsal contract"
```

### Task 2: Aggregate all capacity and modularity consequences

**Files:**

- Create: `scripts/slice-rehearse-capacity.mjs`
- Create: `scripts/slice-rehearse-evaluator.mjs`
- Modify: `scripts/slice-rehearse-core.mjs`
- Modify: `scripts/slice-rehearse.test.mjs`
- Reference: `scripts/repo-size-capacity-evaluator.mjs`
- Reference: `scripts/repo-size-capacity-schema.mjs`

- [ ] **Step 1: Write failing table tests for the T117B blocker chain**

Cover in one evaluation: focused-test split, production helper extraction, two new file slots,
source/test/config category bytes, budget self-size, projection-only closeout conflict, full-gate
requirement, and a non-reusable heavy receipt.

- [ ] **Step 2: Write failing tests for fixed-point capacity derivation**

Require the proposal to:

- add one named allocation;
- preserve every existing allocation byte-for-byte except the existing `capacity-rebase` exact
  numbers needed for budget self-size;
- preserve successor allocations exactly;
- derive global file/byte/category ceilings;
- converge to canonical budget bytes whose own delta is correctly attributed;
- reject overlap, donor use, category disagreement, and non-convergence.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test scripts/slice-rehearse.test.mjs`

Expected: FAIL because evaluation/derivation exports are absent.

- [ ] **Step 4: Implement minimal pure evaluation**

Export:

```js
export function deriveCapacityProposal({ budget, manifest, baselineBudgetBytes }) {}
export function deriveEvidenceKey(receipt) {}
export function evaluateRehearsal({ manifest, repository, budget, baselineBudgetBytes }) {}
```

Return one stable sorted deficit vector. Classify semantic stops separately from operational deficits.
Do not read files, spawn commands, fetch, or write from the core.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test scripts/slice-rehearse.test.mjs`

Expected: PASS, including deterministic repeat evaluation.

- [ ] **Step 6: Commit the evaluator checkpoint**

```bash
git add scripts/slice-rehearse-core.mjs scripts/slice-rehearse.test.mjs
git commit -m "feat(harness): aggregate rehearsal deficits"
```

### Task 3: Derive the bounded operational envelope and evidence reuse decisions

**Files:**

- Create: `scripts/slice-rehearse-evidence.mjs`
- Modify: `scripts/slice-rehearse-evaluator.mjs`
- Modify: `scripts/slice-rehearse.test.mjs`

- [ ] **Step 1: Write failing tests for the envelope**

Prove exact binding of base/origin/writer digest/report digest, allowed routine operations,
capacity maxima, proof commands, heavy lanes, and stop classes. Reject envelope derivation when a
semantic authority stop exists.

- [ ] **Step 2: Write failing evidence-key tests**

Accept only exact head/tree/command/workflow/substrate/writer digests and successful canonical
receipts. Reject each mismatch independently and reject malformed/expired receipts.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test scripts/slice-rehearse.test.mjs`

- [ ] **Step 4: Implement envelope and reuse derivation**

Export `deriveOperationalEnvelope(report)` and return normalized evidence decisions from
`evaluateRehearsal`. The core must never claim the envelope itself is authority.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test scripts/slice-rehearse.test.mjs`

- [ ] **Step 6: Commit the envelope checkpoint**

```bash
git add scripts/slice-rehearse-core.mjs scripts/slice-rehearse.test.mjs
git commit -m "feat(harness): derive operational envelope"
```

## Chunk 2: Read-Only CLI And Telemetry

### Task 4: Add the read-only Git/CLI adapter

**Files:**

- Create: `scripts/slice-rehearse.mjs`
- Create: `scripts/slice-rehearse-git-facts.mjs`
- Create: `scripts/slice-rehearse-cli.test.mjs`
- Create: `scripts/slice-rehearse-facts.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing CLI tests with a temporary Git repository**

Test exact root/origin/base/head/tree/branch/dirty facts, outside-writer dirty stop, missing baseline
budget blob, malformed manifest, canonical stdout, and exit codes `0`, `1`, and `2`. Stub no network
and assert no file changes after execution.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/slice-rehearse.test.mjs`

- [ ] **Step 3: Implement the adapter**

Use `/usr/bin/git` with a fixed PATH and bounded synchronous calls. Read the manifest, current
repo-size report/budget, and baseline budget bytes. Call only the pure core. Print canonical JSON.

- [ ] **Step 4: Add the package command**

Add:

```json
"slice:rehearse": "node scripts/slice-rehearse.mjs"
```

- [ ] **Step 5: Run focused and safety checks**

Run:

```bash
node --test scripts/slice-rehearse.test.mjs
pnpm format:check
pnpm security:guard
```

Expected: GREEN; no Docker/network mutation.

- [ ] **Step 6: Commit the CLI checkpoint**

```bash
git add scripts/slice-rehearse.mjs scripts/slice-rehearse.test.mjs package.json
git commit -m "feat(harness): add read-only rehearsal command"
```

### Task 5: Add observational efficiency telemetry

**Files:**

- Create: `scripts/slice-telemetry.mjs`
- Create: `scripts/slice-telemetry.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for closed telemetry events**

Reject extra/missing keys, negative counters, invalid phases/blocker phases, PII/free-text fields,
and inconsistent elapsed/wait/compute values.

- [ ] **Step 2: Write failing summary tests**

Aggregate three slices and assert elapsed/wait/compute, approvals, re-freezes, retries,
runner-minutes, model cost, blocker distribution, governance ratio, and the four target verdicts.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test scripts/slice-telemetry.test.mjs`

- [ ] **Step 4: Implement the pure JSONL reader/summarizer**

The command accepts exactly `--input <absolute-or-repo-relative-path>`, reads only that file, emits
canonical JSON, and performs no write. Export validation and summarization helpers for tests.

- [ ] **Step 5: Add the package command**

Add:

```json
"slice:telemetry": "node scripts/slice-telemetry.mjs"
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/slice-telemetry.test.mjs
pnpm format:check
```

- [ ] **Step 7: Commit the telemetry checkpoint**

```bash
git add scripts/slice-telemetry.mjs scripts/slice-telemetry.test.mjs package.json
git commit -m "feat(harness): summarize slice efficiency telemetry"
```

## Chunk 3: Capacity Attribution, Documentation, And Final Verification

### Task 6: Attribute the complete Harness V2 writer map once

**Files:**

- Modify: `scripts/repo-size-budget.json`
- Test: `scripts/slice-rehearse.test.mjs`

- [ ] **Step 1: Use the rehearsal core against the final candidate**

Build the Harness V2 manifest with the exact writer map:

```text
docs/superpowers/specs/2026-08-29-harness-v2-efficiency-design.md
docs/superpowers/plans/2026-08-29-harness-v2-efficiency.md
scripts/slice-rehearse-core.mjs
scripts/slice-rehearse-capacity.mjs
scripts/slice-rehearse-evaluator.mjs
scripts/slice-rehearse-evidence.mjs
scripts/slice-rehearse-evidence.test.mjs
scripts/slice-rehearse-facts.test.mjs
scripts/slice-rehearse-git-facts.mjs
scripts/slice-rehearse.mjs
scripts/slice-rehearse-cli.test.mjs
scripts/slice-rehearse.test.mjs
scripts/slice-telemetry.mjs
scripts/slice-telemetry.test.mjs
package.json
```

Request one new bounded allocation `harness-v2-efficiency`; preserve every successor allocation and
reserve byte-for-byte. Let the fixed-point proposal update only the existing capacity-rebase exact
budget-file attribution plus derived global/category ceilings.

- [ ] **Step 2: Verify the proposal before writing**

Assert the proposal has no writer overlap, no successor donor, exact self-size convergence, and one
complete deficit vector. Record its SHA-256 in the test evidence output.

- [ ] **Step 3: Apply the exact proposed budget bytes**

Write only `scripts/repo-size-budget.json` from the reviewed proposal.

- [ ] **Step 4: Run capacity and modularity checks**

Run:

```bash
pnpm repo:size:check
pnpm check:modularity-guard
node --test scripts/ci/repo-size-capacity-schema.test.mjs scripts/ci/repo-size-capacity-evaluator.test.mjs scripts/slice-rehearse.test.mjs scripts/slice-telemetry.test.mjs
```

Expected: GREEN with successor allocations unchanged.

- [ ] **Step 5: Commit the capacity checkpoint**

```bash
git add scripts/repo-size-budget.json scripts/slice-rehearse.test.mjs
git commit -m "chore(harness): attribute v2 capacity"
```

### Task 7: Verify the complete efficiency surface

**Files:**

- Modify if required: `docs/superpowers/specs/2026-08-29-harness-v2-efficiency-design.md`
- Modify if required: `docs/superpowers/plans/2026-08-29-harness-v2-efficiency.md`

- [ ] **Step 1: Format written artifacts**

Run:

```bash
pnpm exec prettier --write \
  docs/superpowers/specs/2026-08-29-harness-v2-efficiency-design.md \
  docs/superpowers/plans/2026-08-29-harness-v2-efficiency.md \
  scripts/slice-rehearse-core.mjs scripts/slice-rehearse-capacity.mjs \
  scripts/slice-rehearse-evaluator.mjs scripts/slice-rehearse-evidence.mjs \
  scripts/slice-rehearse-evidence.test.mjs scripts/slice-rehearse-facts.test.mjs \
  scripts/slice-rehearse-git-facts.mjs \
  scripts/slice-rehearse.mjs scripts/slice-rehearse-cli.test.mjs \
  scripts/slice-rehearse.test.mjs scripts/slice-telemetry.mjs \
  scripts/slice-telemetry.test.mjs package.json scripts/repo-size-budget.json
```

- [ ] **Step 2: Run the focused harness suite**

Run:

```bash
node --test --test-concurrency=1 \
  scripts/slice-rehearse.test.mjs \
  scripts/slice-telemetry.test.mjs \
  scripts/approval-envelope-bootstrap.test.mjs \
  scripts/approval-envelope-ledger.test.mjs \
  scripts/ci/main-e2e-reuse-core.test.mjs \
  scripts/ci/main-e2e-reuse-cli.test.mjs \
  scripts/ci/main-e2e-reuse-github.test.mjs \
  scripts/ci/repo-size-capacity-schema.test.mjs \
  scripts/ci/repo-size-capacity-evaluator.test.mjs
```

Expected: all tests pass.

- [ ] **Step 3: Run repository safety checks**

Run:

```bash
pnpm repo:size:check
pnpm check:modularity-guard
pnpm format:check
pnpm security:guard
git diff --check
```

- [ ] **Step 4: Exercise both commands with fixtures**

Run `pnpm slice:rehearse -- --manifest <fixture>` and `pnpm slice:telemetry -- --input <jsonl>`
from temporary files. Verify canonical output, expected exit status, and zero repository mutation.

- [ ] **Step 5: Inspect final writer map and diff**

Run:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: only the declared Harness V2 paths.

- [ ] **Step 6: Commit final documentation adjustments**

```bash
git add docs/superpowers/specs/2026-08-29-harness-v2-efficiency-design.md \
  docs/superpowers/plans/2026-08-29-harness-v2-efficiency.md
git commit -m "docs(harness): finalize v2 efficiency design"
```

## Execution Notes

- Use `superpowers:executing-plans` with subagents explicitly requested for the CLI/evidence and
  contract-review work; the
  primary agent integrated the shared report, telemetry, capacity, and documentation surface.
- Keep Docker, Supabase, local container E2E, and heavy proof off the Mac.
- Do not create a PR, push, merge, label, or authority projection unless separately requested.
- If implementation reveals a product/security/trust/provider/successor change, stop; deterministic
  capacity or routine-operation derivation inside this writer map does not require another
  micro-approval.
