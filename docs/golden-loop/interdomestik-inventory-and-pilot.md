# Golden Loop — Interdomestik Inventory And Pilot Result (2026-06-11)

Companion to `golden-loop-sop.md` and
`adapters/interdomestik.adapter.json`. This file records the Interdomestik
adapter discovery plus the first completed pilot.

## Environment inventory

- **Repo**: `/Users/arbenlila/development/interdomestik-crystal-home` — pnpm
  10.28.2, Turborepo, Next.js 15, React 19, Drizzle/Postgres, Vitest and
  Playwright.
- **Authority**: `AGENTS.md`, `.claude/.codex/.gemini` slice-runner skills,
  `current-program.md`, `current-tracker.md`, and the architecture-finalization
  program/tracker. Rev 22 invariants are constitution-level.
- **Protected files**: `apps/web/src/proxy.ts`, `README.md`, `AGENTS.md`, the
  canonical plan/tracker docs, and `.github/workflows/`. Tracker/program docs
  are editable only during approved closeout.
- **MCP**: adapter preference is `interdomestik_qa`, Playwright, and
  `context7`. If unavailable, record the blocker and use shell/CLI fallback.
- **Review tooling**: default repo model-review fan-out remains available, but
  Golden Loop uses the adapter waterfall: Fable -> Codex -> Sonnet -> Copilot.
- **Evidence**: `tmp/golden-loop/<slice>/` stores resume state, bounded packets,
  waterfall receipts, and review packets.

## Pilot completed: T-002d

`T-002d` was selected because it was a small M0 guardrail slice: no schema,
proxy, routing, auth, tenancy, UI, or i18n changes, but it directly closed the
Rev 22 type-level guard gap for claim-status persistence.

Result:

- PR: `#1006`
- Merge: `ca35bbfde6d30db82f4e53e5f5b8e510f795302c`
- Branch used: `codex/t-002d-authorized-transition`
- Scope: branded `AuthorizedTransition`, compile-fail fixture, runtime
  re-check, writer guard proof, and narrow domain-claims tests.
- Remote disposition: required checks green before squash merge; Sonar new
  issues resolved; commitlint and pnpm-audit failures remediated.

## Lessons captured

- Use a clean worktree from `origin/main` when the active checkout is dirty.
- Run focused proof first; reserve full gates for the PR boundary.
- `pnpm pr:verify` already runs `check:fast`, which runs `e2e:gate:pr`; the
  standalone `pnpm e2e:gate` is skipped when that PR lane completes and no
  adapter rule requires the broader lane.
- Bounded transitive audit pins may be auto-remediated only when they do not
  change runtime APIs and pass the relevant audit/security checks.
- Canonical tracker/program updates belong in closeout after the PR is merged,
  not mid-implementation.

## Current readiness

The Interdomestik adapter and Golden Loop scripts are ready for a focused
process/tooling PR. Future slice runs should start from the adapter, load resume
state first, run the reviewer waterfall rather than default review fan-out, and
preserve the same human boundary for next-slice approval.
