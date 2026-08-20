# IDA-DG52-A2 — OD17 Child Fail-Closed and Foundation Feasibility Repair

Date: 2026-08-20

Status: strategic authority repair candidate

## Decision

Repair two defects discovered before R1-A approval in the otherwise merged DG52-A1 child
topology:

1. narrow Child A's filesystem/JSON contract to capabilities that exist inside its admitted
   five code/test files and strict 150-line ceilings; and
2. preauthorize one canonical failure-closeout path for every child so any failure before,
   during, or after merge restores `runtime_authorized:false`, blocks all successors, and
   cannot leave a misleading promoted state.

This A2 is a supplement and execution supersession for the affected DG52-A1 clauses. It
does not rewrite or delete A1, its V1 admissions, DG52, DG51, T-115, or historical evidence.
Where A2 is silent, A1 and parent DG52 remain authoritative. The three V1 child admissions
remain immutable history and are superseded for future execution by three separately
validated V2 admissions bound to this exact A2.

A2 authorizes one inert authority-convergence PR only. It does not authorize R1-A, any
semantic implementation writer, GitHub environment/provider mutation, registry install,
workflow dispatch, OIDC, Vercel request, deployment, Preview, qualification, measurement,
verdict, or successor execution.

## Exact base and parent authority

This package is bound to protected `main` at
`d384f8182b1441315d724a58b788a5383e3b53db`, tree
`027592305bab85c95cee39240f1a595a043b404a`, sole parent
`182fe71b3a50ad076f2a8746bf1b6401a724d2d0`. That main contains the exact merged A1
package and remains in canonical state `awaiting_runtime_authority` for
`IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` with
`runtime_authorized:false`.

Parent A1 is exactly 24,802 UTF-8 bytes, SHA-256
`4fa5b4f67eb2207c81c1c0ef03333d5fee50f9090c2c056f2019b3b63653617b`.
Its V1 admissions are exactly:

- Child A: SHA-256 `b1fbae042c1e540fa965d899d6c0094013f0e7ed945a6f7628f1f398baeed36b`;
- Child B: SHA-256 `638f5b5c99425de92813655b9b9899227dbba40e3e9e4876b083acb9c71d3e33`;
- Child C: SHA-256 `009f6cfd77dd4db382b673fe767c70ad607001445c07826dc79d8c89ca90e453`.

PR #1603 reviewed exact head `f77143a0cf4ff3a296aa09f3b51c16d31666d0a6`
and merged it as `d384f8182b1441315d724a58b788a5383e3b53db`, the bound main. Exact-main
Secret Scan `32346761391`, Sonar Main Gate `32346761352`, and CodeQL dynamic runs
`32346760753` and `32346760791` succeeded; open main CodeQL alerts were zero.
Automatic CD run `32346761338` was cancelled with no runner assignment and no executed
steps. Base/tree/health drift before A2 materialization stops for a freshly bound package.

The mechanically clean 24,571-byte R1-A candidate reviewed before this A2 was never human
approved, never materialized in the repository, and authorizes nothing. Its frozen-input
work may be regenerated and rebound only by a future R1-A after A2 convergence.

## Root-cause correction 1 — Child-A feasible canonicalization

DG52-A1 correctly split the former eleven-writer capability into three children, but its
Child-A prose retained two capabilities that were not backed by an admitted primitive:
enumerating/rejecting source xattrs and strict duplicate-key parsing of already
content-addressed immutable JSON. Node 24 core has no xattr enumeration API, while an OS
binary, Python package, native addon, or additional helper would be a hidden capability or
writer. Requiring either would make the five-file/150-line topology dishonest.

Child A therefore uses these exact semantics:

- the canonical archive schema includes only normalized UTF-8 paths, ordinary-file bytes,
  directory structure, the admitted `0644`/`0755` file modes, and `0755` directory modes;
- source xattrs, ACLs, Finder metadata, birth time, owner/group, and every other
  platform-specific extended metadata are outside the archive schema, never serialized,
  never restored, and never used in a digest, verdict, or deployment input;
- extraction creates fresh ordinary files/directories from only canonical schema bytes,
  with explicit modes and no-follow/create-exclusive behavior, so ignored source metadata
  cannot influence the extracted tree;
- the implementation must not invoke `xattr`, `getfattr`, Python, a native addon, or any
  external filesystem-metadata probe. Static tests reject such dependencies. A future need
  to preserve or reject extended metadata is a new capability and authority stop;
- symlinks, hardlinks, sparse files, devices, FIFOs, sockets, invalid modes, path ambiguity,
  mutable owner/mtime fields inside the archive format, and extraction escape remain
  explicitly rejected as A1 requires.

The two immutable JSON inputs are validated as raw bytes before parsing. Exact approved
byte length and SHA-256 must match first; any inserted duplicate key necessarily changes
the byte sequence and fails before `JSON.parse`. Canonical base64 decode/re-encode and
decoded digest checks follow before semantic use. Generated native JSON is emitted by one
deterministic serializer from validated primitives and reparsed for exact schema/value
agreement. Child A does not need or authorize a general strict-JSON parser, extra helper,
or parser dependency.

Tests must prove that duplicate-key, whitespace, key-order, Unicode, and trailing-byte
mutations of either immutable input fail at the raw-byte gate. They must prove that archive
bytes and extracted content/modes are independent of unmodeled source metadata by testing
the admitted schema boundary and by statically rejecting external metadata APIs/commands;
they must not claim cross-platform xattr enumeration that Node cannot perform.

All other Child-A archive, lock, project snapshot, Undici 7.29.0, registry integrity,
zero-audit, first-RED, test-collection, and line-budget requirements remain. The exact
semantic writer map remains eight paths and the exact unique A/B/C union remains 21 paths.
No helper/test pair, ninth Child-A semantic path, policy exception, or line waiver is added.

Before future R1-A approval, one ordinary implementation-feasibility review must verify a
readable allocation for the admitted five code/test files. If any responsibility still
cannot fit without compression, semantic omission, or an undeclared primitive, stop for a
new split rather than approving R1-A.

## Root-cause correction 2 — canonical child failure state

`stop`, an unmerged branch deletion, or a generic revert is not sufficient after any child
merge. A child implementation merge contains its R1 and current-authority transition to
`active_implementation`/`runtime_authorized:true`; a success-transition merge promotes the
next child. A later CD-containment or exact-main-health failure could otherwise leave either
state canonically active despite invalid proof.

Each Child A/B/C V2 admission must therefore define both a success closeout and one distinct
failure closeout. The success closeout paths remain exactly those frozen by A1. The new
failure-closeout paths are:

- Child A:
  `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-artifact-foundation-failure-closeout.md`;
- Child B:
  `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-deployment-confinement-failure-closeout.md`;
- Child C:
  `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-measurement-integration-failure-closeout.md`.

The date prefix remains the A1 authority date. No alternative path or second failure
closeout is authorized.

For each child, the first implementation failure or invalidation fixes one child disposition
and consumes that child's R1. The mandatory failure-closeout PR may change only:

1. the exact child-specific failure-closeout document above;
2. `docs/plans/current-program.md`;
3. `docs/plans/current-tracker.md`;
4. `scripts/repo-size-budget.json` only if the unchanged deterministic generator requires
   it after the three documents are staged.

The failure closeout records sanitized immutable evidence available for the first failure,
sets `runtime_authorized:false`, marks the failed child blocked/consumed, sets
`activeSlice:null`, and makes the canonical resolver
`blocked_requires_current_authority`. It keeps every later child, R2, T-118, T-117, and
T-116 blocked. When that child's success closeout is already merged, the failure-closeout
document must name its exact path and merge SHA and record it as superseded and
non-promoting; the success closeout itself is not edited. It never promotes a successor,
claims child completion/PASS, changes provider state, introduces a new strategy, or
authorizes retry.

Failure-closeout content is allowed for these stages:

- before semantic work or before push;
- on an implementation PR before merge;
- after implementation merge but before or during exact-main health;
- during the success-transition PR before merge;
- after a success-transition merge, including CD containment or exact-main-health failure;
- during branch/ref/worktree cleanup.

The failed child is always the child whose active implementation/governance attempt,
implementation PR or merge, or success-transition PR or merge is the failing or invalidated
stage. After promotion, attribution remains with that predecessor and never shifts to the
successor it promoted.

An unmerged implementation/transition branch is deleted exactly before the failure closeout
when safe. If a merged implementation commit itself must be removed, the V2 admission
preauthorizes at most one separately reviewed exact revert PR containing only the mechanical
inverse of that implementation merge, with no amendment or opportunistic change. That
revert is available only while the implementation merge is the most recent merge touching
its writer paths. It is temporary containment only and may precede the failure closeout; it
is never the canonical failure disposition and never restores or reuses the consumed R1.
Once that child's success transition has merged, removal of either merge requires separate
incident/revert authority and follows the failure closeout.

Every exact revert and every success/failure closeout merge pre-arms the same exact-SHA CD
containment as implementation merges. Premerge proof must show no capable online/busy
`interdomestik-z620-staging` runner and no conflicting active CD concurrency run. Cancel
only the exact merge-SHA CD run and require no runner assignment and zero executed steps.

If any automatic-CD job receives a runner or executes a step, do not claim provider state
absent and do not continue to a successor. The failure closeout records
`containment_failure`, the exact run/job/step evidence, and provider/runtime state as
`unknown` unless independently proven otherwise. It preserves deployment history and stops
for separately approved incident authority; it does not inspect, clean, redeploy, or roll
back provider state under A2.

If the failure-closeout PR cannot merge, stop for blocked current-authority incident repair
without implementation/runtime retry. Neither a temporary implementation revert nor a
prior `runtime_authorized:false` state counts as the terminal child disposition or closes
the consumed R1. If the failure closeout merges but its own CD/main-health evidence is
adverse, its canonical blocked/deauthorized state remains authoritative and the adverse
evidence is handled as an incident; it never promotes a successor.

## V2 admission requirements

Create exactly three V2 admission receipts, one per existing child. Each uses the same
schema/checker contract, one product outcome, the same admitted semantic writer paths,
the same three proof surfaces, one shared runtime consumer, and zero pre-implementation
special environments as its V1 predecessor. Each binds this exact A2 SHA-256 and the exact
base main above. No umbrella admission is permitted.

Each V2 must additionally freeze:

- its unchanged three governance writer paths and semantic writer map;
- its exact A1 success-closeout writer map;
- its exact A2 failure-closeout writer map;
- the failed-child definition and the requirement to mark an already merged success
  closeout superseded/non-promoting by exact path and merge SHA without editing it;
- raw-byte-before-parse and extended-metadata stripping for Child A;
- success progression only after implementation merge, containment, exact-main health,
  success closeout, its containment, and exact-main health are all green;
- failure progression to only one blocked/deauthorized failure closeout;
- at most one exact mechanical revert for an implementation merge only while it is the most
  recent merge touching its writer paths and its success transition has not merged, as
  temporary containment before the mandatory failure closeout;
- no successor, R2, provider, or retry authority on any failure path;
- incident stop semantics for any runner assignment, executed CD step, possible provider
  effect, or failure-closeout/main-health failure.

V2 acceptance must never report the child's `artifact-exact-main-health` or equivalent
proof surface green merely because a merge occurred. Success requires the entire success
transition and health chain. Failure-closeout evidence is not success proof and cannot
satisfy the next child's admission.

## Exact authority PR and current state

After exact approval of final A2 and all three Prettier-normalized V2 admissions, create only
branch `codex/ida-dg52-a2-od17-child-fail-closed-repair` from the unchanged exact base.
One clean writer/worktree may change only:

1. `docs/plans/2026-08-20-ida-dg52-a2-od17-child-fail-closed-repair.md`, byte-identical to
   approved A2;
2. `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-artifact-foundation-admission-v2.json`,
   byte-identical to approved V2-A;
3. `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-deployment-confinement-admission-v2.json`,
   byte-identical to approved V2-B;
4. `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-measurement-integration-admission-v2.json`,
   byte-identical to approved V2-C;
5. `docs/plans/current-program.md`;
6. `docs/plans/current-tracker.md`;
7. `scripts/repo-size-budget.json` only if required by the unchanged deterministic generator
   after the six documents are staged.

No other path may change. Current program/tracker record A2 and all V2 identities, mark the
V1 admissions superseded for execution, keep only Child A at
`awaiting_runtime_authority`, and keep `runtime_authorized:false`. They must not claim R1-A,
implementation, provider, success, or failure evidence.

Use the permanent ordering rule: deterministic generation; repository-configured Prettier
write then check on every Markdown/JSON candidate; admission/current-authority/size/secret/
diff validators; ordinary review; final hash freeze; exact human approval last. Any edit
restarts that sequence. Never preserve content-addressed but unformatted JSON.

Push one authority branch and open one PR against unchanged base. Require exact-head
terminal checks/reviews, zero actionable or unresolved feedback, Vercel ignored/skipped,
zero deployment/runtime, and an immediate final thread re-fetch. Merge only the exact
reviewed head after read-only CD-run/runner preflight; contain only the exact merge-SHA CD
with no runner/step; verify protected exact main, Secret Scan, Sonar, CodeQL, applicable CI,
and every required main signal. Clean only exact refs and return the worktree clean/detached
at exact main.

Only after A2's authority closeout is exact and healthy may a new R1-A candidate be prepared
against that then-current main. The abandoned R1-A candidate and its preliminary hash are
not reusable.

## Approval and PR arithmetic

A1's former exact approval/PR arithmetic is superseded because it did not include this
repair. The success path now has six content-addressed strategic holds in total from A1:
A1, A2, R1-A, R1-B, R1-C, and R2. After A2 approval/merge, the remaining strategic holds
are exactly R1-A, R1-B, R1-C, and R2. The protected `Preview` environment approval remains
the later operational R2 stop-and-confirm, not another strategic receipt.

The success path now has nine repository PRs: A1 authority, A2 repair authority, three
child implementations, three success transitions, and one R2 terminal closeout. Eight are
before provider contact. Failure paths terminate early and may add at most one exact
implementation-merge revert plus one failure-closeout PR for the affected child; they never
proceed to later children or R2.

## Non-goals and invalidation

No semantic implementation, writer-count increase, child merge, transition, provider read,
credential/environment/control mutation, workflow dispatch, OIDC, build, deployment,
Preview, qualification, measurement, verdict, threshold/timing change, product edit,
T-115 retry/relabel, downstream implementation, AI OS mutation, architecture-history
rewrite, or cleanup of provider state is authorized by A2.

Any A2/admission wording, path, base, topology, writer, proof surface, closeout/revert
ceiling, failure semantics, formatting, or hash change invalidates the package before
materialization. Any implementation attempt before A2 convergence is unauthorized. A
future need for extended-metadata enumeration, a general strict-JSON parser, another helper,
or a second failure closeout is fresh strategic authority, not an R1 clarification.

## Approval binding

Human approval must name final A2 UTF-8 byte count/SHA-256, all three separately formatted
V2 admission SHA-256 values, and base main
`d384f8182b1441315d724a58b788a5383e3b53db`. Hashes are computed only after
repository-configured Prettier write/check, independent admission checks, current-authority
and scope validation, secret scan, and ordinary review are clean. Any later edit restarts
formatting, validation, review, and hashing before a new exact approval.
