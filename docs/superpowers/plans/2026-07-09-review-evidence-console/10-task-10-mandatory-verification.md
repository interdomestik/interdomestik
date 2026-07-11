# Task 10: Focused And Mandatory Verification

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 10: Run Focused And Mandatory Verification

**Files:**

- Modify only if a verification failure identifies a defect under `tools/review-evidence-console/`.

- [ ] **Step 1: Run all focused Node tests**

Run:

```bash
node --test tools/review-evidence-console/tests/*.test.mjs
```

Expected: all tests pass with `0` failures.

- [ ] **Step 2: Run syntax, formatting, and diff checks**

Run:

```bash
node --check tools/review-evidence-console/server/app.mjs
node --check tools/review-evidence-console/server/start.mjs
git diff --check
pnpm format:check
```

Expected: every command exits `0`.

- [ ] **Step 3: Run repository static checks**

Run:

```bash
pnpm lint
pnpm type-check
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run mandatory repository gates**

Run:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Expected: every command exits `0`. Record the exact failing command and environment blocker if a gate cannot complete; do not claim a pass from focused checks.

- [ ] **Step 5: Run the final browser acceptance flow**

Start the local server and use the in-app Browser/Playwright MCP to execute inbox → review → validation → receipt → reload → import → correction at every required viewport. Use `/tmp/interdomestik-reviewer-audit/` as the identified protected-reference screenshots and write implementation captures to `/tmp/interdomestik-rec01-visual-proof/`. Compare paired screenshots at matching viewports and states, then fix visible hierarchy, spacing, radius, typography, overflow, focus, and responsive mismatches.

- [ ] **Step 6: Audit scope**

Run:

```bash
git status --short
git diff --name-only origin/main...HEAD
```

Expected: implementation files remain under `tools/review-evidence-console/`; other authorized tracked paths are the approved spec plus `docs/superpowers/specs/2026-07-09-review-evidence-console-design/**`, the approved plan plus `docs/superpowers/plans/2026-07-09-review-evidence-console/**`, `docs/plans/2026-07-10-rec-dg01-review-evidence-console-current-authority.md`, REC rows in `docs/plans/current-program.md` and `docs/plans/current-tracker.md`, and a measured `scripts/repo-size-budget.json` update. `.superpowers/` remains ignored local brainstorming evidence, not slice scope.

- [ ] **Step 7: Commit verification fixes, if any**

```bash
git add tools/review-evidence-console
git commit -m "fix: close reviewer console verification gaps"
```

Skip this commit when verification required no code changes.
