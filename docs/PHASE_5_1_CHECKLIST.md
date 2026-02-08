# Phase 5.1 Checklist (Post-Preflight Validation)

## Purpose

Phase 5.1 is the control point after preflight passes and before any new implementation work starts.
It confirms the baseline is stable, evidenced, and ready for Phase C execution.

## Scope

- Applies after a clean, synced `main`.
- Runs mandatory quality and security gates.
- Captures verifiable evidence from terminal output.
- Performs no code changes unless a failing gate requires a fix.
- No-op rule: Phase 5.1 introduces no functional changes. Only minimal fixes that directly unblock a failing gate are permitted.

## Entry Criteria

- Branch: `main`
- Working tree: clean
- Local `main` synced with remote `origin/main`

## Execution Order

Run command (deterministic):

- Canonical (exec): ./phase-5-1.sh
- Fallback (non-exec): bash ./phase-5-1.sh

Run commands in this exact sequence:

1. `bash scripts/m4-gatekeeper.sh`
2. `pnpm pr:verify`
3. `pnpm security:guard`
4. `pnpm e2e:gate`

## Required Evidence

For each command above, record either:

- Full terminal output, or
- Last 120 lines of terminal output

Each record must include:

- Command name
- Timestamp
- Exit code
- Raw output block
- `git rev-parse HEAD`
- `git status --porcelain` (must be empty)
- Optional for toolchain traceability: `node -v`, `pnpm -v`

## Failure Handling

If any command fails:

1. Stop the sequence.
2. Capture failing output.
3. Apply the minimal fix required for the failing gate only.
4. Re-run the failed command.
5. If it passes, restart the sequence from step 1 and re-run all gates in order.

Special rule:

- If output contains `Standalone artifact is stale`, run:
  - `pnpm --filter @interdomestik/web run build:ci`
- Then restart the sequence from step 1.

## Phase C Guardrails (Non-Negotiable)

- Do not modify `apps/web/src/proxy.ts` unless explicitly authorized.
- Do not rename or bypass canonical routes: `/member`, `/agent`, `/staff`, `/admin`.
- Preserve clarity markers (`*-page-ready`).
- Do not perform architecture refactors (routing, auth, domains, tenancy) unless explicitly requested.
- Do not introduce Stripe in V3 pilot flows.

## Exit Criteria

Phase 5.1 is complete only when all are true:

- `m4-gatekeeper` passed
- `pr:verify` passed
- `security:guard` passed
- `e2e:gate` passed
- Evidence captured for each command
- No unresolved gate failures

## Suggested Evidence Template

```md
## <command>

Date: <YYYY-MM-DD HH:MM TZ>
Exit: <0|non-zero>

\`\`\`text
<full output or last 120 lines>
\`\`\`
```
