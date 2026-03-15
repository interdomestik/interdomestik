# R06 Readiness Cadence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical repo-backed readiness cadence command that proves three consecutive qualifying green pilot days from the existing pilot artifact set.

**Architecture:** Reuse the canonical pointer row in `docs/pilot-evidence/index.csv` to locate the copied pilot evidence index, parse the daily evidence table in `scripts/release-gate/pilot-artifacts.ts`, and expose one CLI entrypoint that reports whether the cadence is satisfied. Update pilot docs and tracker/program state to point to this cadence instead of any historical `A22` inference.

**Tech Stack:** Node.js CLI scripts, existing TypeScript/tsx pilot tooling, markdown/csv parsing utilities, node:test, plan status/proof scripts

---

## Chunk 1: Cadence Logic

### Task 1: Add failing cadence tests

**Files:**
- Modify: `scripts/release-gate/run.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for:
- pass when a pilot has 3 consecutive qualifying green days
- fail when one of the 3 days is amber/red or has incidents
- fail when there are not 3 consecutive days

- [ ] **Step 2: Run the focused suite to verify failure**

Run: `pnpm test:release-gate`
Expected: cadence tests fail because the evaluator does not exist yet

- [ ] **Step 3: Implement minimal shared cadence evaluator**

Add cadence parsing/evaluation helpers in `scripts/release-gate/pilot-artifacts.ts`.

- [ ] **Step 4: Run the focused suite to verify pass**

Run: `pnpm test:release-gate`
Expected: cadence tests pass and existing release-gate tests remain green

## Chunk 2: CLI And Script Contract

### Task 2: Expose the canonical command

**Files:**
- Create: `scripts/pilot-readiness-cadence.ts`
- Modify: `package.json`
- Modify: `scripts/package-e2e-scripts.test.mjs`

- [ ] **Step 1: Write the failing package/script assertions**

Add assertions for `pnpm pilot:cadence:check` and the updated docs references.

- [ ] **Step 2: Run the script-contract suite to verify failure**

Run: `node --test scripts/package-e2e-scripts.test.mjs`
Expected: missing script / missing doc language failures

- [ ] **Step 3: Implement the CLI**

Wire one command that:
- accepts `--pilotId`
- optionally accepts `--requiredStreak`
- prints pass/fail summary and qualifying dates

- [ ] **Step 4: Re-run the script-contract suite**

Run: `node --test scripts/package-e2e-scripts.test.mjs`
Expected: pass

## Chunk 3: Docs And Tracker

### Task 3: Update the pilot operating contract

**Files:**
- Modify: `docs/pilot/PILOT_RUNBOOK.md`
- Modify: `docs/pilot/PILOT_GO_NO_GO.md`
- Modify: `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md`
- Modify: `docs/pilot-entry-criteria.md`

- [ ] **Step 1: Update docs to define the 3-day cadence**

Document:
- what counts as a qualifying green day
- the canonical command
- that `A22` is historical only and not live governance input

- [ ] **Step 2: Verify doc/script contract tests stay green**

Run: `node --test scripts/package-e2e-scripts.test.mjs`
Expected: pass

### Task 4: Mark `R06` complete after proof

**Files:**
- Modify: `docs/plans/current-program.md`
- Modify: `docs/plans/current-tracker.md`

- [ ] **Step 1: Update program/tracker status and proof ledger**

Set `R06` to complete only after verification passes and add touched evidence refs.

- [ ] **Step 2: Run source-of-truth verification**

Run:
- `pnpm plan:status`
- `pnpm plan:proof`

Expected: `R06` complete and proof present

## Chunk 4: Final Verification

### Task 5: Run final verification and dry run

**Files:**
- No additional file changes expected

- [ ] **Step 1: Run full focused verification**

Run:
- `pnpm test:release-gate`
- `node --test scripts/package-e2e-scripts.test.mjs`
- `pnpm plan:status`
- `pnpm plan:proof`

- [ ] **Step 2: Run a temp-dir dry run**

Execute the cadence command against a temp fixture with 3 qualifying days and capture the actual output.

- [ ] **Step 3: Summarize actual results**

Report the exact commands run and whether each passed or failed.
