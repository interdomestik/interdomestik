# Harness V2 Efficiency Design

## Status

Approved by Arben on 2026-08-29 after the terminal T117B-DATA closeout. This is explicitly
authorized workflow-efficiency work, not a product slice and not a successor promotion. Repository
authority is inactive (`no_active_slice`, `runtimeAuthorized:false`, `activeSlice:null`).

## Goal

Turn the repeated operational blockers observed during T117B-DATA into one deterministic,
read-only rehearsal before approval, then let a single bounded approval cover routine idempotent
delivery operations without weakening any product, security, CI, review, or exact-head contract.

The measurable targets are:

- one human approval per normal slice;
- at most one re-freeze;
- zero operational micro-approvals;
- governance/coordination elapsed time at or below 25% of total slice elapsed time;
- no duplicate heavy proof for the same exact evidence identity.

## Final Closure Hardening

The delivery closure keeps workflow and runner-substrate identities independent, uses live
`workflow_run.updated_at` only for run freshness, and preserves the successful runner completion as
the reusable proof timestamp. Canonical ordering is locale-independent, Git reads disable fsmonitor
and optional locks, hidden writer index state fails closed, and cleanup distinguishes an
uninspectable artifact from an inspected artifact whose ownership is unverified.

Capacity planning binds exact baseline bytes, final structured/governance byte ceilings, projection
owners, per-path caps, and planned headroom. A newly created production module has an absolute
200-line ceiling. Ready-for-review state supplies the normal full lane without a label
micro-approval; identity-changing evidence invalidation comes only from pending deficit operations.
Telemetry preserves duplicate evidence occurrences, counts duplicate heavy proof, and includes
merge coordination—but not external review latency—in governance elapsed time.

## Non-goals

- No product, route, auth, tenancy, schema, RLS, billing, provider, or deployment behavior change.
- No automatic merge, push, PR, label, reviewer, branch-protection, or authority mutation.
- No removal, skipping, or weakening of required checks, review intake, Sonar, security, or E2E.
- No autonomous scope expansion and no borrowing from successor allocations.
- No Docker, Supabase, local container E2E, or heavy runtime proof on the Mac.
- No second workflow state machine alongside the existing approval ledger and current-authority
  resolver.

## Observed T117B Failure Pattern

T117B-DATA was technically successful but operationally expensive because independent guards
revealed compatible constraints serially:

1. historical PR selection required a narrow compatibility repair;
2. the focused test crossed its line limit and required a test split;
3. the production module crossed its cohesion limit and required a helper extraction;
4. the two new files exposed file-slot capacity only after the split;
5. budget self-size and category accounting exposed byte deficits after file capacity was fixed;
6. mixing compatibility repair with a two-path closeout violated the projection-only closeout
   identity, requiring a prerequisite PR and bounded force-with-lease rebuild;
7. broad E2E and exact-head delivery checks were rerun while evidence identity remained unchanged;
8. each deterministic remedy was technically within the intended slice but surfaced as a separate
   authority question.

These are not reasons to weaken the guards. They are evidence that the harness needs a whole-chain
planner before mutation.

## Options Considered

### Option 1: Keep independent checks and improve messages

Rejected. Better messages do not prevent serial discovery, repeated approval holds, or duplicated
runner work.

### Option 2: One read-only rehearsal plus a bounded operational envelope

Selected. Existing guards remain authoritative. The rehearsal invokes their pure logic, derives all
known capacity and topology consequences together, and emits one report that a human can approve.

### Option 3: Fully autonomous delivery pipeline

Rejected. It would combine authority, implementation, GitHub mutation, and proof into one opaque
system, expanding the trust boundary and making failure recovery harder.

## Architecture

Harness V2 adds two small command surfaces:

1. `slice:rehearse` — validates a proposed slice manifest and emits a canonical read-only report.
2. `slice:telemetry` — summarizes already-recorded slice events without mutating repo or provider
   state.

The rehearsal is an adapter over existing authority, repository-size, modularity, Git identity, and
evidence contracts. It does not replace them.

The implementation keeps manifest validation, fixed-point capacity derivation, evidence identity,
evaluation, and the Git adapter in cohesive modules. These splits are part of the rehearsed writer
map up front, so modularity-driven helper/test extraction is priced before the capacity proposal
rather than discovered as a later approval blocker.

### Rehearsal input

The manifest is closed-schema JSON with:

- schema version, slice ID, tier, exact base SHA, and canonical origin;
- exact writer paths;
- a per-path plan (`create` or `modify`, maximum positive byte delta, maximum physical lines, and
  expected category);
- the requested routine operations from a closed set; sensitive operations carry exact targets,
  preconditions, postconditions, and may be deferred until their PR identity exists;
- proof commands, heavy proof lanes, and exact workflow/substrate digests;
- optional evidence receipts proposed for reuse.

The routine-operation set is intentionally limited to:

- `split_focused_test`;
- `extract_cohesive_helper`;
- `add_focused_test`;
- `derived_capacity_rebind`;
- `fresh_worktree_patch_replay`;
- `sequence_prerequisite_before_projection`;
- `bounded_force_with_lease_rebuild`;
- `apply_full_gate_label`;
- `rerun_invalidated_proof`;
- `task_owned_cleanup`.

Anything else is rejected before evaluation. Force-with-lease, label, and cleanup operations cannot
be bare strings: they require target-bound contracts. A deferred label becomes executable only
after its recorded predicates resolve. Cleanup remains deferred and fail-closed unless an
independent canonical adapter proves exact ownership, safe discard, and inactive authority; absent
that evidence it is an explicit authority stop, never a name-based inference.

### Rehearsal facts

The CLI gathers only read-only local facts:

- repository root, canonical origin, exact manifest base, live protected main, `HEAD`, tree,
  three-dot changed paths, base ancestry, branch, and clean/dirty paths;
- exact protected repo-size budget bytes and the current version-2 budget;
- typed modularity limits for each planned path;
- writer ownership and overlap with existing named allocations;
- exact baseline bytes for the repo-size budget file;
- local evidence receipt bytes supplied by the manifest.

All Git reads disable optional locks and repository fsmonitor hooks. Writer and tracked-file reads
fail closed on symlinks or other non-regular files. It does not fetch, start services, change
labels, write budgets, or call Docker.

### One deficit vector

The core evaluator emits all deficits in one sorted vector:

- unallocated writer paths;
- writer overlap or successor-donor conflict;
- planned new-file count and positive tracked-byte delta;
- category deltas;
- line/cohesion split requirements;
- budget-file self-size;
- global ceilings implied by a new named allocation;
- closeout topology conflicts (for example, projection-only closeout mixed with repair paths);
- required full-gate admission;
- missing or non-reusable heavy evidence.

Deficits are data, not stop conditions by themselves. A deficit is either covered by the derived
operational envelope or classified as a genuine authority stop.

### Fixed-point capacity derivation

The current v2 budget is closed and derived, but the existing sync command deliberately does not
derive new named allocations. Harness V2 adds a pure fixed-point derivation:

1. add the proposed named allocation without consuming another allocation's headroom, or
   structurally rebind only its own already-derived allocation when replaying the same owner;
2. recompute aggregate file, byte, and category ceilings from baseline + all named allocations +
   reserve;
3. recompute the existing `capacity-rebase` exact delta for `scripts/repo-size-budget.json` against
   the protected baseline;
4. serialize canonical JSON and repeat until the budget file's own byte delta stabilizes;
5. return the exact proposed budget bytes and SHA-256 in the report, but do not write them.

The derivation preserves every foreign and successor allocation byte-for-byte. A projection-only
closeout may name a separate `repairAllocationId`, allowing the repair budget to land first while
the two canonical projection paths remain an exact closeout. The normal envelope sequences that
prerequisite before opening the projection PR, avoiding a force rebuild; exact force-with-lease is
reserved for already non-linear history and requires its own exact head/PR/lease contract.
Non-convergence, overlap, unknown
category, negative bounded capacity, or global/category disagreement fails closed.

### Operational approval envelope

When the report has no semantic stop, it derives a single envelope containing:

- exact base, origin, writer map, and a facts SHA-256;
- every requested and validated routine operation, plus the smaller set currently required by the
  observed deficit vector;
- maximum file/byte/category growth from the fixed-point capacity proposal;
- exact proof commands and heavy lanes;
- a rule that only invalidated proof may rerun;
- stop classes for product, security/privacy, trust-boundary, provider effect, successor scope,
  unknown writer, non-linear history, or evidence-identity drift.

The envelope does not grant authority by itself. It is an approval payload for the existing human
approval + authority machinery. Deterministic operations inside it do not need new micro-approval.

### Exact evidence identity and reuse

Heavy evidence is discovered through the protected GitHub PR-E2E workflow and exact run/runner
facts. Inline receipts are advisory only. Every proposed reusable receipt is normalized to one
evidence key over:

- the exact heavy-proof lane;
- exact head SHA and tree SHA;
- proof command digest;
- workflow/contract digest;
- database/runner substrate digest;
- relevant writer-map digest.

Reuse is accepted only once per required lane, when the protected adapter proves a canonical,
successful, completed and unexpired run, every identity component matches, and no declared writer
is dirty. Manifest expiry claims are never trusted. Duplicate or cross-lane receipts cannot satisfy
another lane, and identity-changing operations re-add the heavy-proof rerun requirement. Any
uncertainty returns `reusable:false`.

### Telemetry

`slice:telemetry` consumes JSONL events produced by the orchestrator or exported from existing
receipts. It records no PII, source code, secrets, prompts, or free text. The closed event schema
contains:

- slice ID and phase;
- elapsed, wait, and compute milliseconds;
- approvals, re-freezes, retries, and runner minutes;
- optional model cost in USD;
- blocker phase from a closed enum;
- exact evidence key when applicable.

Exact duplicate records are rejected and arithmetic is overflow-safe. Reviewer latency is excluded
from governance time, while only extra operational approvals count as micro-approvals. If any
contributing event has unknown model cost, the slice and aggregate cost remain `null` rather than
being reported as zero. The summary reports totals,
governance ratio, and target pass/fail. Initial use is observational for the next three slices; it
does not block delivery.

## Output Contract

`slice:rehearse` prints canonical JSON with exactly:

- `schemaVersion`;
- `sliceId`;
- `tier`;
- `repository`;
- `writers`;
- `capacity`;
- `modularity`;
- `topology`;
- `evidence`;
- `deficits`;
- `authorityStops`;
- `operationalEnvelope`;
- `reportSha256`.

Exit status is `0` when the report is complete, even when it contains covered deficits. It is `2`
for a valid report with genuine authority stops and `1` for malformed/unavailable evidence.

`operationalEnvelope.factsSha256` hashes the canonical report facts with the envelope and outer
hash set to `null`. `reportSha256` then hashes the complete canonical report, including the derived
envelope, with only `reportSha256` set to `null`; this avoids self-reference while binding the
approved envelope.

## Failure Posture

- Malformed manifest or local evidence: fail closed with no partial JSON.
- Dirty path outside the declared writer map: authority stop.
- Existing allocation owner conflict: authority stop; never borrow silently.
- Successor allocation donor request: authority stop.
- Budget fixed-point non-convergence: fail closed.
- Evidence mismatch: mark non-reusable and schedule only the owning proof.
- Unknown routine operation: malformed manifest.
- Product/security/trust/provider/successor change: new human authority required.

## Verification

- Pure unit tests for manifest validation, deterministic ordering, all-deficit aggregation, fixed
  point, self-size, successor preservation, and stop classification.
- CLI fixture tests using temporary Git repositories; no network or Docker.
- Evidence-key tests for exact match and every identity mismatch.
- Telemetry tests for aggregation, governance ratio, target evaluation, and malformed events.
- Existing approval-envelope, repo-size, modularity, main-E2E-reuse, security, formatter, and CI
  contract tests remain green.

## Rollout

1. Land the read-only commands and tests.
2. Run `slice:rehearse` before approval for the next three slices.
3. Collect read-only telemetry for those slices.
4. Compare against the targets and tune caps/envelope vocabulary only from observed evidence.
5. Consider deeper runner/CI integration separately; do not auto-enable it in this work.

## Expected Outcome

The T117B sequence of test split -> helper extraction -> file capacity -> byte/category capacity ->
prerequisite repair -> projection-only closeout -> full-gate should appear as one pre-approval
report. The normal path lands the prerequisite before opening the projection PR, eliminating the
rebuild rather than pre-authorizing an unknown future head. The human approves one bounded envelope,
the implementation runs only invalidated proof, and a new approval occurs only for a genuine
semantic or already non-linear history boundary.
