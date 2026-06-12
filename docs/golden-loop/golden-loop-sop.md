# Golden Loop SOP (project-agnostic, v0.1)

Status: Phase 1 foundation — piloting on one project. Project-specific rules
live in an adapter validated by `scripts/golden-loop/adapter.schema.json`. The
Golden Loop never weakens a constitution; stricter project authority wins.

## Goal

Deliver exactly **one promoted slice at a time** with high design confidence,
autonomous implementation/verification, minimal model/API/git/remote calls, and
human approval concentrated at the **next-slice boundary** — not sprinkled
through routine decisions.

## Inputs

- `adapter` — the project adapter (JSON), validated by `adapter.schema.json`.
- `sliceId` — the single promoted slice for this run.
- `resumeState` — `<evidenceRoot>/<sliceId>/state.json` if a prior run exists.

## Loop phases

| #   | Phase              | Autonomy           | Notes                                                                                                                                                                        |
| --- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0  | Resume + preflight | auto               | Load adapter; load resume-state; inspect branch/dirty/staged/untracked **before any edit**; never stash/reset/touch unrelated changes.                                       |
| P1  | Slice confirmation | **human boundary** | Slice must be promoted by the adapter's canonical trackers. If ambiguous → stop and report; never invent a slice.                                                            |
| P2  | Design confidence  | auto               | Read authority files in adapter order; write a short design note into state. If design requires touching a protected path or violating an invariant → stop (human boundary). |
| P3  | Implementation     | auto               | Branch per adapter rules; scoped edits only; respect file-size and modularity rules from the adapter.                                                                        |
| P4  | Verification       | auto               | Run gates by **cost class** (below). Cheap → expensive; full-cost gates at most `budgets.maxFullGateRuns` per slice.                                                         |
| P5  | Review             | auto               | **Sequential reviewer waterfall** (below). First valid, blocker-free senior review suffices.                                                                                 |
| P6  | PR + remediation   | mostly auto        | Classify PR as runtime or docs-only; batch-poll CI/Sonar issues/Sonar hotspots/Copilot/reviewer feedback; auto-remediate `autoSafe` classes until green or human-blocked.    |
| P7  | Merge + closeout   | auto, gated        | If `autoMerge` criteria pass, squash-merge; then update canonical trackers/programs in a compact closeout PR and prepare the next-slice handoff for human approval.          |

Opening a PR is **not** completion. A slice is complete only when the
implementation PR is merged, required closeout is merged, branch/worktree are
clean, and the repo is ready for the next slice.

## Gate cost classes

Adapters classify every gate as `fast` (run per iteration), `slice` (run before
PR), `full` (run once at PR boundary; budgeted), or `remote` (CI — observe,
don't duplicate locally beyond the adapter's required local proof). Re-running
a `full` gate without a code change in between is a budget violation.

If a successful full gate declares `covers` for a later gate/lane, the later
gate may be skipped only when its adapter entry lists that gate in
`skipWhenCoveredBy`. Record the coverage note in evidence. This removes
duplicate work; it never removes an uncovered constitution-required gate.

## PR classification and monitoring

Classify every PR before monitoring. Runtime implementation PRs require full
runtime gates; docs-only closeout PRs should stay docs-only and avoid heavy
runtime lanes where branch policy allows it.

Every monitor poll checks GitHub checks, Sonar open issues, Sonar open
hotspots, and unresolved Copilot/reviewer threads. Auto-merge requires green
required checks, Sonar issues `0`, Sonar hotspots `0`, and all threads resolved.

Do not fix docs-only closeout size/format failures by expanding into
runtime/tooling changes unless a required tooling defect is proven. Compact or
split closeout docs so the PR stays docs-only.

## Reviewer waterfall (replaces default fan-out)

Reviewers are an **ordered list** in the adapter. Route N+1 is consulted only
if route N is: unavailable, errored, refused/rerouted, returned an invalid
(empty/off-topic) review, or returned **unresolved blockers**. A refusal or
reroute by any model route is a normal fallback event, **not** a slice blocker.
The first available, valid, blocker-free review from a senior route satisfies
the review requirement; remaining routes are skipped (this is the call-count
win). Every consulted route gets a receipt entry (status + reason) so the
evidence trail stays auditable. Reviews receive a **bounded evidence packet**,
never raw logs or whole files.

**Senior-review contract.** A review counts as valid evidence only if it
contains all of: `REVIEWER:` (model/identity), `SLICE:` (must match the slice
under review), `SCOPE:` (files reviewed or evidence-packet reference), a
`FINDINGS:` section (unresolved must-fix items prefixed `BLOCKER:`), and an
explicit `VERDICT: READY | READY AFTER FIXES | BLOCKED`. Only `READY` with no
unresolved `BLOCKER:` findings is blocker-free and can win the waterfall.
Generic prose, short output, or output missing any contract field is
classified `invalid` and falls through to the next route.

**Dry-run is never review evidence.** A dry-run probes route availability
only: it produces an availability receipt (`route-available`/`unavailable` per
route), never a winner, never a valid review receipt, and writes no review
packet. Use it for preflight; it satisfies nothing in P5.

## Budgets (per slice, defaults — adapter may tighten)

- `maxModelCalls`: design ≤ 2, review waterfall ≤ 1 per route, remediation ≤ 2.
- `maxGitRemoteCalls`: ≤ 2 fetch + ≤ 2 push per run; PR state polled in batches
  (one combined checks+threads query per poll), poll interval ≥ 5 min.
- `maxFullGateRuns`: ≤ 2 per slice.
- Exceeding a budget is a stop condition, not a license to continue.

## Bounded evidence packets

All evidence given to reviewers, recorded in state, or pasted into PRs is
produced by the packet tool: head+tail truncation, exit code, byte counts, and
content hash. Never inline unbounded command output. Review packets include git
status sections for staged, unstaged, and untracked paths.

## Resume state

`<evidenceRoot>/<sliceId>/state.json` records: slice id + source-of-authority
refs, branch + base SHA, design note, gate results (name, cost class, pass/fail,
evidence path), review receipts, PR number/URL, budget counters, blockers, and
a `phase` cursor. A later run loads this and **does not rediscover** repo
layout, tooling, or design decisions. State writes are atomic
(write-temp + rename) and append a one-line journal entry.

## Human-approval boundaries (always mandatory)

1. Next-slice selection / promotion (the main boundary).
2. Any edit to a protected path or canonical tracker outside closeout rules.
3. Any schema/migration/RLS/auth/tenancy/routing change beyond the promoted
   slice's explicit scope.
4. PR remediation outside `autoSafe` classes (scope growth, risk acceptance,
   invariant conflicts).
5. Merge when adapter `autoMerge` criteria are not fully satisfied.
6. Budget exhaustion or any stop condition below.

## Stop conditions

Stop and report (never improvise) when: active slice is ambiguous; a protected
path must change and the adapter doesn't authorize it; gates/credentials/
Docker/MCP/model routes are blocked in a way that invalidates verification;
worktree contains unrelated changes that the slice would have to touch; an
invariant conflict is discovered; any budget is exhausted.

## Dirty worktrees and unrelated changes

Unrelated local changes are **preserved untouched**: no stash, no reset, no
checkout over them, never staged or committed with slice work. If the slice
cannot proceed without touching them, that is a stop condition.

## Canonical tracker / program updates

Trackers and program docs are updated **only at closeout** (P7), only via the
adapter's `closeout` rules, only after required gates and review evidence are
green, and only for the delivered slice. Mid-run progress lives in resume
state, not in canonical docs.

**Protected paths vs closeout — the only exception.** Files listed in both
`protectedPaths` and `closeout.updateTargets` may be edited only during approved
closeout, after `closeout.rules` pass, and only for the delivered slice.
Protected paths outside update targets remain stop/human-boundary surfaces.
