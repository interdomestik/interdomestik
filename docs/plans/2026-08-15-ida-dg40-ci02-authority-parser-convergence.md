# IDA-DG40 R2 — CI02 Authority Parser Convergence

Status: reviewed candidate; no exact approval, promotion, runtime, writer, branch, or mutation authority

Date: 2026-08-15

Authority base: `fddff9f69fee90e179248b3b185bb08bd7c32bdd`

Classification: governance / CI infrastructure, not a product slice

Risk tier: 3 — the resolver can authorize an implementation writer

## Decision candidate

Promote exactly one bounded governance slice:
`IDA-CI02-AUTHORITY-PARSER-CONVERGENCE`.

The slice makes the global `interdomestik-slice-runner` resolver apply the
same deployed canonical-decision selection behavior as the read-only AI OS
Interdomestik adapter's `canonicalDecision` path. It closes only cases where
the global resolver may retain or activate a candidate that the shared
canonical-decision contract classifies as conflicting.

This slice deliberately mirrors the adapter's actual deployed behavior:
canonical decision markers are recognized case-insensitively and need not
begin at column zero, and the last matched canonical decision is selected.
Unrelated later prose that does not match a canonical decision marker is
ignored. A matched canonical decision with invalid or ambiguous metadata is
conflicting and exposes no active slice.

The adapter's separate legacy `Current authority note:` fallback is not part
of this slice. Stricter AI OS grammar hardening, anchoring, case freezing, or
fallback removal requires separate AI OS authority. This slice does not claim
full convergence with that legacy fallback.

This is not product behavior and does not count as an R2 observation. R2 is
already terminal `KEEP` after three representative product observations. This
slice does not reopen CI01 or B10.

## Verified starting checkpoint

- AI OS check observation
  `835f0624201cb68876629bc5a41361137c5229a2daa8a687b55249f31ce2978e`
  completed exit `0`: Brain `current`, Integrity `clear`, Interdomestik
  authority `current`, M1 verified current, M2/M3 terminal, M4-M6 no qualified
  candidate, M7 no authorized enrollment.
- Repository `main == origin/main ==`
  `fddff9f69fee90e179248b3b185bb08bd7c32bdd`, ahead/behind `0/0`, clean, one
  root worktree, and no local or remote `codex/*` branch.
- `preflight.mjs`: PASS with branch-hygiene report
  `aa5c5e5e8f5e961a709e52218b4319c9e21e05d04f8898665434a95abbb46d28`.
- `next-slice.mjs`: expected nonzero
  `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, `activeSlice=null`.
- `workflow-scorecard.mjs`: expected nonzero only because no slice is promoted;
  new-slice branch readiness is otherwise PASS.
- `convergence-check.mjs`: PASS.
- Open PRs are only Dependabot PRs `#1508`, `#1552`, and `#1553`; no active
  product or governance writer exists.

## Exact problem evidence

A read-only differential matrix supplied byte-identical program/tracker
fixtures to:

1. the global runner
   `/Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs`;
2. the existing AI OS adapter's `canonicalDecision` path
   `/Users/arbenlila/Documents/Knowledge Manager and Systems Architect/tools/lib/ai-os-state/adapters/interdomestik.mjs`.

Both agree on the three valid lifecycle states when program and tracker contain
matching canonical decisions:

- terminal decision -> `blocked_requires_current_authority`, no slice;
- active decision with one `runtime_authorized:false` clause ->
  `awaiting_runtime_authority`, exact slice, no runtime;
- active decision with one `runtime_authorized:true` clause plus required
  scope/exclusion/evidence sections -> `active_implementation`.

The remaining differences are:

| Fixture                                                                                          | Global resolver                               | AI OS canonicalDecision | Required disposition     |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------- | ------------------------ |
| Missing runtime clause                                                                           | nonzero awaiting but retains candidate        | conflicting, no slice   | no candidate slice       |
| Duplicate true/false runtime clauses                                                             | nonzero awaiting but retains candidate        | conflicting, no slice   | no candidate slice       |
| Two final canonical candidates                                                                   | nonzero awaiting but retains latest candidate | conflicting, no slice   | no candidate slice       |
| Legacy `` `<id>` is now the next active governed implementation goal `` marker with runtime true | exit `0`, active                              | conflicting, no slice   | reject legacy grammar    |
| Canonical marker split across two lines with runtime true                                        | exit `0`, active                              | conflicting, no slice   | reject multiline grammar |

The last two rows are actual writer-authorization contradictions. The first
three already fail nonzero, but retaining an apparent `activeSlice` makes
downstream diagnostics and human interpretation diverge. The correction must
converge the lifecycle tuple and writer permission, not merely the exit code.

## One outcome

For every shared canonical-decision fixture, the global runner and the existing
AI OS `canonicalDecision` path agree after representation normalization on:

- authority valid versus conflicting;
- lifecycle state: blocked, awaiting runtime, or active implementation;
- exact active slice or `null`;
- runtime authorized versus not authorized; and
- whether writer creation is permitted.

The global runner accepts only decisions that the deployed AI OS
`canonicalDecision` selector itself recognizes. Matched decisions with missing,
duplicate, malformed, or disagreeing metadata expose no active slice. Legacy
and multiline promotion prose cannot activate a writer. Nonmatching prose is
not promoted into an authority attempt. This does not claim parity for the AI
OS adapter's separate legacy fallback.

## Frozen writer maps

### Authority-publication writers

- `docs/plans/2026-08-15-ida-dg40-ci02-authority-parser-convergence.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

These are docs-only gate/activation/closeout writers. The size budget is
deterministic repository metadata only; no application or AI OS runtime
configuration is authorized.

### Parser-runtime writers

- `/Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs`
- `/Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.test.mjs`

No third parser-runtime writer is authorized. `workflow-scorecard.mjs`,
`convergence-check.mjs`, `behavior-eval.mjs`, the AI OS adapter, and all their
tests are read-only consumers/oracles. If any requires a code change rather
than passing unchanged, stop and re-gate instead of widening.

## Canonical-decision contract

The global runner must mirror the existing adapter `canonicalDecision`
selection contract, without importing or changing AI OS:

1. Inspect physical lines independently; a decision cannot span lines.
2. Recognize the established terminal marker and the established active marker
   with case-insensitive, unanchored matching, exactly as the deployed adapter
   does.
3. Select the last line that matches either canonical marker. A later line that
   matches neither marker is ordinary prose and does not invalidate the last
   matched decision.
4. For an active decision, extract one normalized backticked slice ID and
   case-insensitively match exactly one backticked `runtime_authorized:true` or
   `runtime_authorized:false` clause from that selected physical line; normalize
   the value before lifecycle comparison.
5. A selected active line with multiple candidates, active-plus-terminal
   semantics, malformed suffix, missing/duplicate runtime clauses, or an
   invalid ID is conflicting and exposes no active slice. A selected terminal
   line is invalid only when the same physical line also contains an active
   canonical marker; otherwise its suffix prose is not parsed as active
   metadata, matching the deployed adapter.
6. Program and tracker must each yield a canonical decision and agree on
   decision kind, normalized slice ID, lifecycle status, and runtime value.
   Missing canonical authority on either side or disagreement is conflicting.
7. Historical matched markers before the last matched decision remain evidence
   only. Legacy promotion prose and multiline promotion prose are not canonical
   decisions and cannot activate a writer.
8. Valid-state JSON fields consumed by the scorecard, convergence check, and
   behavior evaluation remain backward compatible. No output-schema migration,
   new parser service, shared framework, AI OS import, or cross-workspace
   runtime dependency is allowed.

## Contract graph and consumer closure

- Entry: current program and current tracker text.
- Parser: global `next-slice.mjs`.
- Direct consumers: `workflow-scorecard.mjs`, `convergence-check.mjs`, and
  `behavior-eval.mjs`.
- Independent oracle: only the existing AI OS Interdomestik adapter's
  `canonicalDecision` path.
- Test collectors: global `next-slice.test.mjs`; unchanged scorecard,
  convergence, and behavior suites; unchanged AI OS adapter corpus.
- Writer boundary: only the two parser-runtime files above.

The exact executable/documented consumer inventory is frozen by:

```sh
rg -n "next-slice\\.mjs|runtimeAuthorized|resolution\\.status|activeSlice" \
  /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts \
  /Users/arbenlila/.codex/skills/interdomestik-slice-runner/references \
  /Users/arbenlila/.codex/skills/interdomestik-slice-runner/SKILL.md \
  /Users/arbenlila/development/interdomestik-crystal-home/scripts \
  /Users/arbenlila/development/interdomestik-crystal-home/package.json \
  /Users/arbenlila/development/interdomestik-crystal-home/.github
```

Discovery of another executable JSON/exit-code consumer stops the slice unless
it passes unchanged; it does not authorize another writer.

Read/write/delete closure is complete: the parser reads authority text and
emits JSON; it writes no repository, runtime, control, Brain, tracker, or
product state. Error closure includes missing files, malformed matched
markers, duplicate clauses, multiple candidates, program/tracker disagreement,
completed architecture candidates, and the `ARCH-FINAL` umbrella.

## TDD and acceptance evidence

1. Add RED focused fixtures for legacy and multiline runtime-true activation,
   retained candidates under invalid grammar, and program/tracker mismatch.
2. Apply the smallest parser-only correction in `next-slice.mjs`; the test file
   is the only other parser-runtime writer.
3. Prove valid canonical blocked, awaiting, and active decisions, including
   prefixed/case-varied lines recognized by the deployed adapter.
4. Prove malformed matched active metadata, missing/duplicate runtime clauses,
   multiple candidates, active-plus-terminal content, mixed-case runtime
   clauses, terminal trailing prose, unrelated later nonmatching prose, CRLF
   input, missing program/tracker authority, and program/tracker disagreement
   all produce the exact deployed-oracle disposition.
5. Prove legacy promotion prose, multiline promotion prose, completed
   architecture candidates, and the `ARCH-FINAL` umbrella never permit a
   writer.
6. Run the focused resolver suite with no skipped test, all bundled global-skill
   regression suites, package validation, and `node --check` for every bundled
   `.mjs`.
7. Run unchanged scorecard, convergence, and behavior evaluation suites. Valid
   output fields and exit-code semantics must remain compatible.
8. Run the unchanged AI OS Interdomestik adapter corpus and a differential
   shared canonical-decision matrix. Normalize representation only; lifecycle,
   slice, runtime, and writer-permission results must agree.
9. Run the exact consumer inventory and classify every result. No unclassified
   executable consumer may remain.
10. Run real repo preflight/resolver/scorecard on exact clean main. Before
    activation and after terminal closeout the result must be blocked/null.
11. Because this is Tier 3 authority infrastructure, run the applicable repo
    final contracts without weakening them. Global package tests remain the
    primary proof; unchanged repo gates are regression proof only.
12. Prove rollback in a disposable copy from the content-addressed archive,
    including individual and aggregate hashes, focused parser proof, unchanged
    consumer proof, and exact active-execution clearance.

No browser behavior changes, so visual/product Playwright proof is not an
acceptance surface. Any full E2E is regression evidence and must not be
repeated after an unchanged head.

## Highest-risk cases

- legacy or multiline runtime-true prose still activates a writer;
- invalid authority exits nonzero but retains an apparent active slice;
- the runner rejects prefixed/case-varied canonical decisions that the deployed
  AI OS selector accepts;
- later unrelated prose incorrectly invalidates the last matched decision;
- a historical decision or completed architecture candidate outranks the last
  matched canonical decision;
- program/tracker disagreement is repaired by source precedence;
- valid JSON shape or exit semantics silently break direct consumers;
- implementation mutates AI OS or creates a cross-workspace dependency;
- the adapter's legacy fallback is expanded into this slice.

## Review disposition

- Claude Opus 5 completed one 103.106-second process without a terminal
  verdict. This is invalid `reviewer_no_terminal_verdict` evidence and was not
  resent.
- GPT-5.6 Sol High returned `REVISE`; one consolidated remediation addressed
  oracle/grammar, runtime-transition, consumer, rollback, and size-budget gaps.
- Exact-artifact Sol High re-review returned `REVISE` because the candidate
  froze stricter anchored/case-sensitive grammar than the deployed AI OS
  selector and did not explicitly authorize the later two-file runtime
  mutation.
- Arben approved the narrowed design direction: mirror actual deployed
  `canonicalDecision` behavior, retain only the two global parser-runtime
  writers, and defer stricter AI OS hardening to separate authority.
- Final Sol High review of the 17,034-byte R1 artifact returned `REVISE` after
  309.20 seconds with one P2: runtime-clause matching had to be case-insensitive
  and terminal suffix prose had to remain outside active-metadata validation.
  This R2 candidate applies exactly that smallest correction within the same
  two-writer ceiling. Per Arben's direction to finish without another review
  loop, no terminal model PASS is claimed; the finding is closed by direct
  source comparison and focused differential proof before runtime activation.

Repository checks, package tests, the unchanged AI OS oracle, GitHub checks,
Sonar, CodeQL, security, finalizer, and exact-main health remain authoritative.

## Runtime sequence and approval separation

1. Exact approval of this immutable gate authorizes only its docs-only
   authority PR and merge; runtime remains false.
2. After gate merge, rerun AI OS check, preflight, resolver, scorecard, and
   consumer inventory on exact main.
3. Prepare a separate content-addressed runtime receipt bound to that exact
   main, this gate, exact task/execution identity, archive manifest, commands,
   writer paths, and rollback.
4. Exact approval of that receipt first authorizes only the docs-only activation
   PR that changes canonical runtime authority from false to true.
5. Only after activation merge and exact-main convergence, that same exact
   runtime approval authorizes mutation of the two named global parser-runtime
   files. It authorizes no other file or workspace mutation.
6. After implementation proof, publish a docs-only closeout that records exact
   evidence and returns authority to blocked/null. Clear only the exact active
   execution and task-owned artifacts permitted by cleanup policy.

No product branch, Brain session, AI OS runtime/config/control mutation,
deployment, production action, provider action, schema action, or second slice
is authorized by this gate.

## Rollback and stop conditions

Before parser-runtime mutation, archive the exact two global skill files into a
content-addressed task artifact and record each SHA-256 plus one aggregate
manifest SHA-256. Only one exact active execution may exist. Rollback freezes
that execution, restores only those two byte-identical files, verifies both
individual hashes and the aggregate manifest, reruns focused parser and
unchanged consumer evidence, clears the exact execution, and publishes a repo
closeout returning the canonical marker to blocked/null.

Stop and re-gate if:

- another parser-runtime writer is required;
- any direct consumer needs a code change;
- AI OS adapter/config/runtime/control mutation is required;
- output schema or exit-code compatibility cannot be preserved;
- the exact consumer inventory reveals an unclassified executable consumer;
- program/tracker authority is not exact or disagrees;
- Brain is not current, Integrity is not clear, or a blocking contradiction
  exists at a required checkpoint;
- the archive, hashes, rollback proof, exact execution, or exact-main identity
  cannot be verified; or
- product, workflow, browser, schema, deployment, production, provider, M6/M7,
  or a second-slice scope appears.

## Explicit exclusions

- all product UI, routes, proxy, auth/session, tenancy, membership, persistence,
  schema/RLS, billing, analytics, dashboard, Hero, browser flow, and product
  copy;
- GitHub workflow semantics, R2 measurement policy, CI01, B10, dependency PRs,
  and branch-protection changes;
- AI OS adapter, tests, Brain, M1-M7 controller/config/runtime/freeze, Atlas,
  publication, retention, and retrieval changes;
- the legacy AI OS `Current authority note:` fallback and any stricter grammar
  hardening;
- deployment, production, provider, database, Docker, Vercel, and Z620 runtime
  allocation changes; and
- any second governance or product slice.
