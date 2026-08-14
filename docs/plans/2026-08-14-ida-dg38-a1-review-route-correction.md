---
document_id: IDA-DG38-A1-REVIEW-ROUTE-CORRECTION
date: 2026-08-14
status: corrective_candidate_not_approved
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: 2ecc45fceb79ccf701fd02bb93bf2905ba233700
original_gate: IDA-DG38-UI03a2-B9-INCOMPLETE-SAVED-DRAFT-SUBMIT-TRUTH
original_gate_sha256: 00d428c16b3e66efaf645882df293f7ee475b60d0b307450c4edc7a16ff9deb3
sole_slice: IDA-UI03a2-B9-INCOMPLETE-SAVED-DRAFT-SUBMIT-TRUTH
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
---

# IDA-DG38-A1 — Reviewer-route and late-feedback correction

## Decision boundary

Correct only the reviewer-route contradiction and missing reviewer receipt discovered after
the docs-only merge of `IDA-DG38`. Preserve the original gate's product outcome, risk tier,
writer map, copy, behavior, acceptance matrix, protected surfaces, rollback boundary and
single-slice ceiling byte-for-byte.

This candidate authorizes no product code, runtime receipt consumption, active execution,
Brain product session, product branch/worktree, heavy proof, deployment or production action.
It becomes repository authority only after Arben exact-approves this document identifier,
UTF-8 byte count and SHA-256 and a byte-identical docs-only corrective PR merges.

## Frozen checkpoint and invalidated evidence

The repository is clean and synced at
`2ecc45fceb79ccf701fd02bb93bf2905ba233700`, the squash merge of authority PR `#1555`.
The exact merged PR head is `012aa7b76a8813ee623d3866328a3f08ec5f9b71`. The original gate remains
byte-identical at 22,497 UTF-8 bytes / SHA-256
`00d428c16b3e66efaf645882df293f7ee475b60d0b307450c4edc7a16ff9deb3`.
Admission `cf9547813f36c44fdcf27b582a92e4f232419398067f304849224493f290d445`
remains `ready`; UI/UX governance
`1de03274d868d074dd450ebeb5011608e09cbb86ff1d5538bd951a443b8c3b44`
remains `pass`. The resolver still selects only B9 at `awaiting_runtime_authority` with
`runtime_authorized:false`.

At `2026-08-14T10:29:21Z`, after PR `#1555` had merged at
`2026-08-14T10:28:05Z`, the GitHub Codex reviewer submitted two current, unresolved threads
against exact head `012aa7b76a8813ee623d3866328a3f08ec5f9b71`:

1. P1 `discussion_r3782950944`: the original gate names Claude Opus 5 first and only
   GPT-5.6 Sol Ultra as fallback, while canonical program/tracker evidence claimed GPT-5.6
   Sol High satisfied review.
2. P2 `discussion_r3782950948`: the proof row omitted the complete route receipt required by
   `code_review.md`, including invocation, timestamps, status, blocker, exit disposition,
   timeouts and fallback winner.

Failure classification is `reviewer feedback` plus `workflow/gate`. The last valid checkpoint
is the exact merged product scope and admission/UI evidence. The following evidence is
invalidated and must not be reused:

- the claim that authority PR `#1555` had zero review threads;
- the claim that DG38's reviewer-route contract was satisfied;
- the shorthand-only reviewer proof row as terminal review evidence;
- `IDA-UI03a2-B9-RUNTIME-R1`, 24,316 bytes / SHA-256
  `fbdb8b6ffe4e1298afc9db1f34ca7f905373c773acadd95de1f2ef20b1700d47`.

Selection, scope, admission, UI/UX, exact gate identity, docs-only checks, merge/main security
evidence, CD containment and branch/worktree cleanup remain valid and must not be repeated.
Product implementation has not started; product mutations, product E2E runs, Z620 heavy work
and Mac heavy runtime remain zero.

## Exact reviewer-route correction

For DG38/B9 only, Arben's current explicit instruction supersedes the original gate's stale
reviewer-routing paragraph:

- do not invoke Claude Opus for the remaining DG38/B9 lifecycle;
- GPT-5.6 Sol High is the authorized bounded senior route for the corrective authority and the
  later implementation review;
- do not silently substitute Sol Ultra, Sonnet, Gemini or another route;
- one complete review produces one finding set;
- one consolidated remediation is permitted when findings exist;
- only substantive remediation invalidates that review and permits one current-artifact
  re-review;
- no repeated request, quota probe or reviewer loop is authorized.

This is a reviewer-route correction, not a relaxation of repository gates. Model review stays
advisory and cannot replace exact-head CI, Sonar, CodeQL, repository-native security,
`pr-finalizer`, feedback intake or human exact-hash approval.

## Mandatory reviewer receipt

Before exact approval of this amendment candidate, preserve one task-owned, content-addressed
reviewer receipt outside the product repository. It must bind the exact reviewed candidate
SHA-256 and the complete source packet and include:

- route name, provider, exact model and reasoning level;
- exact invocation mechanism or command;
- `startedAt` and `endedAt` UTC timestamps and elapsed milliseconds;
- `ran | blocked | skipped | failed` status;
- blocker reason or explicit `none`;
- process exit code, or an explicit non-shell `not_applicable` disposition;
- first-output timeout and total timeout;
- fallback winner and the exact user instruction authorizing the route;
- verdict and ordered finding counts;
- exact artifact hashes reviewed;
- whether a remediation and re-review occurred.

Unknown historical metadata must not be inferred. If the earlier Sol High route cannot produce
a complete receipt, run one fresh bounded Sol High review of the exact current candidate,
original gate, both GitHub threads and the relevant selector/re-entry/test wiring, and preserve
that complete receipt. Do not invoke Opus.

## Corrective repository writer map

The future docs-only corrective PR may write exactly:

1. `docs/plans/2026-08-14-ida-dg38-a1-review-route-correction.md` — byte-identical approved
   amendment;
2. `docs/plans/current-program.md` — append one revision superseding only DG38 reviewer-route
   and review-evidence disposition;
3. `docs/plans/current-tracker.md` — append one corrective row/revision with complete reviewer
   receipt identity and late-thread disposition;
4. `scripts/repo-size-budget.json` — conditional deterministic sync only.

Do not edit the original exact-approved DG38 gate. Do not add an implementation-completion row.
Do not touch architecture-finalization trackers, README, AGENTS, `code_review.md`, AI OS/Brain,
skill, workflow or product files.

## Focused proof and feedback closure

The corrective PR must prove:

1. exact amendment bytes/hash and exact base/main identity;
2. original DG38 gate bytes/hash remain unchanged;
3. complete reviewer receipt exists outside the repo and its hash is recorded canonically;
4. `git diff --check`;
5. `pnpm docs:verify`;
6. `pnpm plan:status`;
7. `pnpm plan:audit`;
8. `pnpm track:audit`;
9. `node scripts/repo-size-budget-sync.mjs --check` and `pnpm repo:size:check` in a clean
   worktree;
10. resolver still selects only B9 with runtime false;
11. exact-head required checks, Sonar, CodeQL, gitleaks, pnpm audit and finalizer are green;
12. all comments/reviews/threads are fetched after checks settle, both late threads receive
   evidence-backed replies and unresolved-thread count reaches zero.

No product full E2E is consumed by this docs-only correction. If an automatic CD starts, cancel
it before checkout and prove zero build/provider/deployment effect.

## Post-merge boundary

After exact-head merge and exact-main security/quality proof:

1. update the evidence ledger to retain the late-feedback fingerprint;
2. remove only the exact merged corrective branch/worktree after clean identity proof;
3. rerun resolver and the read-only AI OS check;
4. prepare a new `IDA-UI03a2-B9-RUNTIME-R2` bound to the corrective main and complete reviewer
   receipt;
5. stop again for R2 exact bytes/SHA-256 approval;
6. retain the independent AI OS control-clearance hold. Brain stale, Integrity drift or any
   blocking contradiction still forbids active execution and product mutation even after human
   runtime approval.

## Exclusions and stop conditions

No product/copy/i18n/test change, scope expansion, second outcome, second slice, protected
surface, direct AI OS refresh, baseline/config/controller change, M6/M7 fabrication, Atlas,
provider, deployment or production action is admitted.

Stop for any base/hash mismatch, inability to preserve the original gate, incomplete reviewer
receipt, new actionable review finding, unlisted writer, non-green docs/current-head evidence,
unresolved thread, automatic CD effect or need to change product scope. Preserve the last valid
checkpoint and rerun only the evidence invalidated by the correction.

## Exact approval boundary

After the bounded Sol High review and any single consolidated remediation, compute exact UTF-8
bytes and SHA-256. Arben's approval must name this exact amendment identifier, byte count and
hash. Approval authorizes only a byte-identical docs-only corrective authority PR. It does not
authorize B9 runtime or waive the independent AI OS control-clearance hold.
