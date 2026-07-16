# Draft-Aware CI Cost Controls Design

## Status

Approved by Arben on 2026-07-16. This is explicitly authorized CI/governance work,
not a promoted product slice. The canonical resolver remains
`blocked_requires_current_authority` with no active product slice.

## Goal

Reduce GitHub-hosted Actions usage during slice development without weakening the
Phase C merge contract or changing product runtime behavior.

## Classification

Tier 3 because the change touches shared CI/gate infrastructure. It does not
touch `apps/web/src/proxy.ts`, auth, tenancy, routes, schemas, RLS, billing
runtime, product code, README, AGENTS, or architecture authority.

## Observed Problem

- A busy day creates 23-35 PR synchronizations and 312-408 workflow runs.
- Draft pushes trigger the same heavy CI, PR E2E, Pilot Gate, and deterministic
  backstops as merge-ready PRs.
- Cancellation limits stale work but still consumes runner minutes before exit.
- CodeQL is unavailable on the private repository without Code Security and is
  no longer branch-protection-required.

## Design

### Gate policy

Add a tested, deterministic policy returning:

- `run_full=true` for non-PR events, non-draft PRs, `full-gate` labeled PRs, or
  draft PRs touching high-risk paths;
- `run_full=false` for ordinary draft PRs;
- `force_full=true` for a `full-gate` label or high-risk path;
- a stable reason and high-risk-path inventory for auditability.

High-risk paths cover routing/auth/tenant boundaries, database and Supabase
surfaces, membership billing, GitHub workflows/actions, CI policy scripts, and
PR finalizer scripts.

### Workflow modes

- CI, PR E2E, Pilot Gate, and PR Deterministic Backstops use the shared policy.
- Ordinary draft PRs run lightweight preflight/wrapper work only.
- High-risk drafts and `full-gate` drafts run the full hosted lanes.
- `ready_for_review` explicitly triggers every affected workflow.
- A subsequent synchronize on a non-draft PR runs full gates again.
- Push, schedule, and manual-dispatch behavior stays full.

### Merge safety

- Existing required check names remain unchanged.
- `pr-finalizer` runs lightweight on ordinary drafts.
- On full-gate-eligible PRs, `pr-finalizer` polls the current head and accepts
  only successful required checks; skipped heavy checks are not accepted.
- The finalizer required-check list matches the eight live branch-protection
  contexts and removes unavailable CodeQL contexts.
- GitHub draft state prevents merge before `ready_for_review`; the explicit
  event then creates current-head full-gate runs.

### Copilot cost posture

No automatic Copilot-review ruleset is added. Intermediate slice review stays in
Codex; Copilot review is requested once when the PR is ready for final review.
This is an explicit user override of the slice-runner skill's default repeated
Copilot-review cadence for cost control.

### Self-hosted posture

No runner migration is included. The repository-level Mac mini is online, but a
Linux runner is not proven available. Hosted Ubuntu remains authoritative until
a separate runner-readiness slice proves deterministic parity and rollback.

## Failure Modes And Mitigations

- Missing `ready_for_review` run: explicit event types and current-head polling.
- Incorrect draft detection: pure policy tests plus CLI fixture tests.
- High-risk path omitted: conservative path list and fail-full on missing event
  or changed-file evidence.
- Manual override absent: repository label `full-gate` triggers the full lane.
- Wrapper false-green: finalizer requires successful current-head full checks
  whenever policy says `run_full=true`.
- Runner outage: hosted Ubuntu remains unchanged in this phase.

## Test And Evidence Plan

1. RED/GREEN unit tests for ready, draft, label override, high-risk draft,
   missing evidence, and non-PR events.
2. RED/GREEN workflow contract tests for triggers, preflight/runner/wrapper
   structure, stable required names, and finalizer polling.
3. YAML parsing and workflow security/permission contract tests.
4. Focused CI contract suite.
5. Tier 3 final gates: `pnpm pr:verify`, `pnpm security:guard`, and
   `pnpm e2e:gate`, plus local parity where the environment permits.

## Rollback

Revert the policy module, workflow conditions/refactor, and finalizer contract in
one PR. Branch protection contexts do not change, so rollback requires no rules
migration.

## Expected Outcome

Ordinary draft slice iteration should reduce total hosted minutes by roughly
60-80%, while the same mandatory evidence is required on the current head before
merge.
