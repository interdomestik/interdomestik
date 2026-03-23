# Memory Precheck Automation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a passive, diff-aware memory precheck that surfaces relevant lessons before `pr:verify` and `pr:verify:hosts`.

**Architecture:** Add one small script in `scripts/plan-conformance/` that reads changed files, maps them to retrieval rules, validates and indexes the existing memory registry in-process, and prints an advisory summary. Wire it into the existing verification commands without blocking them on advisory misses.

**Tech Stack:** Node.js ESM scripts, existing plan-conformance memory modules, `node:test`, pnpm scripts.

---

## Chunk 1: Precheck Behavior

### Task 1: Define and test the public behavior

**Files:**

- Create: `scripts/plan-conformance/memory-precheck.test.mjs`
- Create: `scripts/plan-conformance/memory-precheck-rules.json`
- Create: `scripts/plan-conformance/memory-precheck.mjs`
- Modify: `package.json`
- Modify: `scripts/pr-verify-hosts.sh`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run `node --test scripts/plan-conformance/memory-precheck.test.mjs` and verify the expected failures**
- [ ] **Step 3: Implement the minimal precheck script and rules file**
- [ ] **Step 4: Run `node --test scripts/plan-conformance/memory-precheck.test.mjs` and make it green**
- [ ] **Step 5: Wire the script into `pr:verify` and `pr:verify:hosts`**
- [ ] **Step 6: Run focused verification for the updated commands**

## Chunk 2: Final Verification

### Task 2: Verify the integration

**Files:**

- Modify: `package.json`
- Modify: `scripts/pr-verify-hosts.sh`
- Create: `tmp/plan-conformance/*` during verification only

- [ ] **Step 1: Run `pnpm test:plan-conformance`**
- [ ] **Step 2: Run `node scripts/plan-conformance/memory-precheck.mjs --changed package.json` and inspect the advisory output**
- [ ] **Step 3: Report the exact commands and evidence used for verification**
