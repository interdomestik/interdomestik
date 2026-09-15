---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-15
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Ordinary delivery follows the current program. Explicit legacy Lean runtime
> still requires matching canonical JSON and live Git/GitHub facts.

## Active Queue

`MEMBER-CASE-OVERVIEW-ENTRY` is the sole selected successor on exact main `62376c15`.
Shared shell navigation, the bounded T410 notification increments and T210 are completed history.
The current member screen is legacy integration evidence only. The planned net-new member UI/UX
belongs in the unified portal shell; canonical role routes and readiness markers do not authorize
separate dashboard designs or freeze the legacy presentation.

| ID                                   | Status        | Owner      | Work                                                          | Exit Criteria                                                                   |
| ------------------------------------ | ------------- | ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MEMBER-CASE-OVERVIEW-ENTRY`         | `in_progress` | Sol/high   | Add direct entries to represented member case cards.          | Accessible locale-correct mapping, focused/full proof, review and protected PR. |
| `T410-PESSIMISTIC-MUTATION-BOUNDARY` | `completed`   | Astra/high | Admit only audited reversible production `useOptimistic` use. | PR #1772 protected-merged; exact-merge required checks succeeded.               |

T410 PR #1772 protected-merged as `62376c156bc0058e0491d550f261cb621eb4f02e` at
2026-09-15T05:02:15Z. Exact-merge CI static/unit/E2E, audit, CodeQL, gitleaks, Sonar analysis and
Sonar gate checks succeeded. This completes the bounded pessimistic-mutation slice only; it does not
claim full T-410 completion. The commission-writer correction and exact 7,077-byte/one-helper
supplement were owner-approved.
The split helper (5,032 bytes, 123 lines) and test (10,131 bytes, 233 lines) match reviewed SHA-256
`44bab82f076d41a40c355bd09f680bb0a79fc74eb82125be3e3b969dd581a1c2` and
`24a501237ed76d2d7e26fb0790f0c059e2eb17aac8475317422b0a26c2460cac` respectively.
The independent review recorded 48 source-backed writers and 140 adversarial checks; the applied
split passes all six focused contracts, capacity and modularity. Direct dependency admission
covers five modules/eighteen symbols without granting whole-program provenance guarantees.
Exact implementation `ee59416494987281b8fab20c8a947f04325478e7` passed uninterrupted `pr:verify`:
1,183 CI contracts, 154 release, 41 RLS, 3,383 web/12 skips, 252 browser-gate/12 skips and
13 smoke/11 skips; line coverage 81.29% (21,664/26,649). Separate security guard passed.
The isolated v3 database, nip.io hosts, port and disk were preflighted; uploads stayed disabled.
Private full-log SHA-256: `f1e0222da4cc0cde7073c0313170faefd54ad1fe96fb3197fe2c1d893ec43e5a`.
Gemini's native pinned `gemini-3.1-pro-high` returned five fixtures without tool events; all were
executed against the bounded contract. Function-name admission, wrong-module permission and
whole-program shadowing expectations were rejected. No new defect or source change resulted.
Native model identity is client-reported, not independent server attestation. Sonnet returned no
output in five minutes (`20260914T204241-sonnet`); the owner explicitly waived Claude for this
slice after authorizing both subscription reviews. Existing independent Astra review is retained.
The build-generated declaration is excluded. Protected review/merge and exact-main health remain
pending; this evidence-only update does not transfer proof to changed implementation.

Default-binding correction: review at `52a0b908` reproduced missed destructuring/parameter
literal defaults. The added regression failed before the fix and all six focused contracts pass
after it. Own initializer chains now include binding elements and parameters; object projection
and reassigned-key flow remain excluded. Independent review additionally caught parameter/body
shadowing under the checker's default ES5 target; matching the parser's Latest target and two
opposite-direction regressions address it. The owner approved the 759-byte supplement and a
further 190 bytes: helper 5,181 bytes/130 lines, test 10,931 bytes/247 lines; no new files or
budget self-size change. Gemini's bounded contribution supplied four proposals, executed as eight
paired checks; all passed. Independent review passed 92 checks on the corrected candidate.
Renewed full `pr:verify` and separate `security:guard` passed at
`c050edd6de682971cc3cd5e3e7a6eca1e7922519`: 1,183 CI contracts, 154 release tests, 41 RLS tests,
81.29% line coverage (21,664/26,649), two browser preflights, 252 gate passes/12 skips and
13 smoke passes/11 skips. Private full-log SHA-256:
`78e97760085b273cc1687320d9bc46f914cee559a77b43c2354d273915cfc72e`.
Protected review and all leaf checks passed at `aa0147ec`. Delivery `34926953847` instead blocked
two actionable Sonar complexity annotations hidden by its green quality summary. The unchanged
strict delivery gate is retained. A behavior-preserving helper refactor splits regex alternatives
and extracts import-name handling; official `eslint-plugin-sonarjs` 4.2.0 reproduces the original
27/20 regex and 24/15 function findings and reports neither on the correction. Research checked
the [official regex rule](https://github.com/SonarSource/SonarJS/blob/master/packages/jsts/src/rules/S5843/rule.ts)
and installed official rules on 2026-09-15; the rule-doc site was robots-blocked. No repo dependency
or configuration change. Owner equivalence proof passed 64,572 regex comparisons, 33 import
fixtures and all 3,117 source-file scanner results. Gemini supplied four proposals, executed as
six assertions; inert declarations were distinguished from regex-name matching. Native request
`40b70d24-792c-45a2-8f9c-67c8899cf52b` used the pinned Pro route with no tool calls; model identity
has the same client-reporting limitation recorded below. Claude remains owner-waived. Helper
SHA-256 `4a43664fc747ae7af8cc137170dc05daca32cb18f149b74ad5f27dcc9518aeff`, 5,175 bytes/134 lines;
test hash and all capacity values unchanged. Independent review passed 47,664 regex comparisons,
36 scanner-equivalence fixtures, five import assertions, six contracts and both Sonar rules.
The full local recommended Sonar rule set also reports no findings. Renewed uninterrupted
`pr:verify` and separate `security:guard` passed at `4849de16928fb9ccb1d35fccd3e4e541e0e76da1`:
1,183 CI contracts, 154 release tests, 41 RLS tests, 81.29% coverage (21,664/26,649), two browser
preflights, 252 gate passes/12 skips and 13 smoke passes/11 skips. Private full-log SHA-256:
`638d0594ebff30a1d2db47ca0abeffb0ccd5f5459cece002e1ec44edd26b7ec3`.
Protected current-head review/checks, merge and exact-main health remain pending.
The hypothetical `updateClaimStatusLabel` naming collision was independently reproduced and
dispositioned as the approved conservative live-name policy, not proof of runtime mutation;
[review reply](https://github.com/interdomestik/interdomestik/pull/1772#discussion_r4011853886)
records the limitation. No such symbol exists in the current repository; import admission remains
independent and no exact-runtime-effect guarantee is claimed.

## Proof Ledger

| ID                                   | Source Refs                                     | Execution  | Run ID     | Run Root | Sonar   | Docker | Sentry           | Learning         | Evidence Refs                                                                                     |
| ------------------------------------ | ----------------------------------------------- | ---------- | ---------- | -------- | ------- | ------ | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `T410-PESSIMISTIC-MUTATION-BOUNDARY` | current program; architecture T-410/T-401/T-002 | `scripted` | `4849de16` | local    | pass    | pass   | `not_applicable` | `not_applicable` | Protected PR #1772 merged as `62376c15`; exact-merge required checks passed.                      |
| `MEMBER-CASE-OVERVIEW-ENTRY`         | current program; architecture T-116/T-117/T-118 | `manual`   | pending    | local    | pending | pass   | `not_applicable` | `not_applicable` | RED/GREEN route mapping and four-locale catalog checks pass; final review and full proof pending. |

### Member case overview entry progress

The mounted `@case` slot and `PortalCasesRegion` were confirmed on exact main `62376c15`; the dormant
legacy member dashboard is not used. The bounded candidate keeps the existing projection and
case-kind registry, adds no fetch or visibility, and passes one localized, descriptive detail-link
node into each card. Missing references become numbered localized case fallbacks so separate
destinations do not share an ambiguous name. The cards keep reference, status, document count and
next-step source order while adding wrapping, a 44px minimum link target and visible focus styling.

The focused route-mapping test failed RED with no link role, then passed GREEN for three distinct
cases and exact logical paths. Case renderer, portal boundary/catalog and request-context suites pass
36 tests; web type-check passes. The executable modularity policy passes with one advisory: the
existing portal runtime is 157 lines against the 150-line preferred checkpoint and remains below the
300-line review boundary. The initial capacity check exposed the complete changed source/test
surface before final verification. The consolidated measured proposal, pending owner authority, is:
`t117b-portal` total 16,644→17,449, source 2,904→3,603, tests 2,341→2,447, and its three
changed path caps 1,062→1,670, 2,341→2,447 and 832→923; `t117b-cutover` total
39,769→41,738, source 5,611→6,329, tests 15,105→16,356 and the boundary-test path
8,634→9,895; `t117c-rendering` total 84,210→84,292, source 10,613→10,695 and the
portal-context path 4,138→4,220. Applying those approved values proved the terminating budget
fixed point is byte-identical: capacity-rebase self/config remains 62,581 and total remains 99,985.
Derived global ceilings are total 61,283,259→61,286,115, source 8,850,403→8,851,902 and tests
7,077,378→7,078,735; config remains 2,232,807. This is 528 bytes below the approved total/config
upper estimate rather than padded metadata. Files and every other ceiling remain unchanged. No
reserve, deleted-byte credit, new file, catalog growth or guard weakening is used.

The one requested non-sensitive `fm` label-template trial failed with ModelManager error 1008 and
was rejected as zero-benefit, with no retry or dependency. The repo subscription probe found Gemini
3.1 Pro callable and Claude Sonnet 5 installed but not authenticated (`Not logged in · Please run
/login`). Runtime policy separately requires explicit approval before disclosing the bounded
non-secret source/interface packet to Gemini. No T410 Claude waiver is transferred. Independent
Astra/high review found the long-reference 320px reflow risk and blank-reference ambiguity; the
candidate now bounds and wraps the link and maps blank references to the same distinct fallback
contract. Browser proof, helper proposals and expensive final proof remain pending.

### T410 pessimistic mutation boundary progress

The exact owner-approved adjustment keeps stable allocation `t410-notification-acknowledgement`:
52,182→57,982 total bytes, 35,800→41,600 test bytes and 700→6,500 for the existing CI contract;
global total becomes 61,273,546 and global tests 7,072,947. Files remain seven and budget self-size
remains 62,480. The unchanged 4,000-byte front-door cap uses equivalent JSON notation `4e3` only
to preserve byte-identical self-size. There is no capacity change to that path, deleted-byte credit,
reserve use, new file or guard weakening. The owner subsequently approved the complete reviewed
footprint's exact 1,687-byte supplement: total 57,982→59,669, tests 41,600→43,287, CI path
6,500→8,187, global total 61,273,546→61,275,233 and global tests 7,072,947→7,074,634.
Files and budget self-allocation remain unchanged. Further capacity requires approval before push.

The initial bounded AST contract admitted only the notification-center consumer, rejected unregistered and
stale allowlist entries, ignores comments/strings and established test scaffolding, detects aliases,
indirection, computed access and declaration-after-use, covers production TS/TSX/JS/JSX/MJS/CJS,
and derives repository identity from `import.meta.url`. Four focused contracts pass in under one
second at that historical source; the capacity audit and modularity guard passed. Sonnet 5 and Gemini 3.1 Pro
implementation-snapshot reviews reported the configured served models. Accepted review corrections
removed a one-byte unrelated cap change, broadened identifier detection and removed CWD dependence.
Gemini's category and formatting claims are disproved by the passing repository budget audit and
Prettier check.

PR #1772 current-head review at `f99c181a` found one actionable ordering gap: a key alias declared
before its terminal hook-name alias was never revisited. The terminating fixed-point correction at
`82565632a0a4f3b7c53cb1f7408f38f4fcfa1862` covers arbitrary alias ordering and chains. Fresh review
at `096085c2` then found that the audited notification consumer could itself import a forbidden
mutation and that the ordered-priority prose still named the completed optimistic increment as sole.
Exact implementation head `1cb7e9783b5a561810ac58fb4a21f2f3c691d972` fixes both: a conservative
forbidden-mutation inventory covers claim status, recovery, settlement, payout, success fee,
airline-claim and sponsored-membership writers even through aliases, namespace access and computed
keys, and the sole-selection prose names the pessimistic boundary.

Final-head review at `5b39aea4` found one additional actual status-spine wrapper: `cancelClaim`
delegates through `cancelClaimCore` to `transitionClaimStatus`, but the forbidden verb inventory did
not include cancellation. Exact implementation head `b45d8e4507525bef7e20a7f7ca4219e32c31ab4c`
adds cancellation and its regression seed while keeping the existing CI contract at 6,496 bytes,
inside the unchanged 6,500-byte cap.

Review at `29d74be9` found two further concrete gaps: the existing `cancelSubscription` /
`cancelSubscriptionCore` action pair was outside the suffix inventory, and a string-literal
`ExportSpecifier` could re-export `useOptimistic` under an alias without discovery. Both are covered
through the same classifier branches as claim cancellation and import specifiers. The linked
finalizer run `34844384999` correctly rejected that stale head because these two threads remained
unresolved; it was not a CI defect. Fresh Astra inventory then found `createClaimFromSavedDraft`, a
public server action that invokes `submitClaimCore` and creates submitted lifecycle state. Exact
implementation head `92102e84eafd9d75087f28a16d373ababa732c5f` adds that real wrapper to the
classifier and regression seed. The final contract is 6,497 bytes, inside the approved 6,500-byte
path cap, without changing any capacity value.

Review at pushed head `62e7ceed` then found a distinct false-positive boundary: raw-source matching
could treat inert comments or user-facing strings as forbidden mutation references. The
comprehensive correction at exact implementation head
`1b1812e85c274495e736544001bec5dae392b86f` parses real file kinds and derives hook/mutation names
only from syntax-tree identifiers and decoded string literals. It resolves hook and mutation literal
aliases to a terminating fixed point, preserves quoted imports/exports, calls, member/element access
and computed destructuring, and ignores comment trivia, inert strings and object keys. Astra review
also exposed and verified the necessary real-filename TSX parsing after JSX. The explicit support
boundary is named imports/exports, calls, member access, destructuring and locally resolvable literal
aliases; arbitrary runtime-computed names, reflection and whole-program cross-module renaming are not
claimed.

Review at pushed head `df221bd9` then found that unconditional bare identifier matching could still
classify inert object and type keys named `useOptimistic` as live references. Exact implementation
head `2360ad271636d4cb6499b9552146fd7184ad07b1` replaces that branch with semantic classification:
named imports/exports, bindings and shorthand properties are explicit references, while ordinary
identifiers must be in expression context. Inert property/type/interface/class/method/declaration/
parameter names and JSX attributes are ignored, while real calls, values, shorthand, member/element
access, destructuring and aliases remain detected. The contract is 6,467 bytes; SHA-256
`d73a7a8ce4531c3bf09438d5fdfb5af6d50296da6f373b721f45701d07c04b1f`, Git blob
`0ea8615932b09b646daf628c64f921dc3874297f`.

Fresh independent Astra/high review passed after first finding and correcting the shorthand-value
counterexample before publication. Its final adversarial matrix covered 12 inert and 14 live hook
forms, 13 mutation forms, 22 inventory names, quoted aliases, 64 chained-alias orderings, cycle
termination, both TSX discovery regressions, exclusions and stale/unregistered consumers. Four
focused contracts, repo-size, modularity, plan, Prettier and diff checks passed. After a discarded
environmental attempt against an accidentally unmigrated database, the next isolated database was
created, migrated, and preflighted at 86 public tables with all 11 checked critical tables under RLS;
its standalone required RLS lane passed before the expensive gate. A first whole-command proof on
the corrected source passed all non-browser code gates but was discarded when `CI=true` required an
unavailable passwordless-sudo `/etc/hosts` change. The clean rerun used the repository-supported
nip.io route. The same exact implementation head then passed `pnpm pr:verify` against
`interdomestik_ci_t410_boundary_01a09f54_v3`: the complete CI and release contract suites, 41 RLS
tests, 3,383 web passes with 12 intentional skips, 81.29% repository line coverage, 252 gate passes
with 12 intentional skips, and 13 smoke passes with 11 intentional skips. The separate
`pnpm security:guard` passed. The successful run used the protected workflow's canonical
same-database CI-parity configuration; source-map upload was disabled and no deployment ran. These
results bind to the implementation head; this evidence-only plan update does not transfer them to
changed product code. Protected final-head checks, expected-head merge and exact-main health remain
pending.

Current correction: review at `bcaee170` found renamed destructuring assignments were missed and
ordinary string display/telemetry aliases were falsely counted as callable references. Product CI
passed; finalizer `34861048756` correctly rejected the two unresolved threads. Astra/high took sole
implementation ownership because the repeated semantic escapes required a comprehensive checkpoint.
Exact source `d681cf09326db53e0482aab2df5eee3415158341` classifies assignment targets using
TypeScript and resolves literal initializer chains through lexical symbols with cycle protection.
Literals remain data, consumed only as computed keys or to exclude data reads. Callable references
are discovered where introduced, so later renaming cannot hide their file. Type-only imports/queries
are excluded; live generic instantiation and class extends expressions remain discoverable.
Dynamic reflection, reassigned-key flow, cross-module renamed wrappers and runtime React provenance
are outside this static named-reference contract. Existing inventory/catalog/discovery assertions remain.

Fresh read-only Astra/high review passed 150 independent checks against scanner SHA-256
`0e2f65f8334526655a9e8c2a0a68cdf0c049728f6315af8644df071fb078f9ef`, size 8,187 bytes.
Four focused contracts, including 58 paired hook/mutation cases, passed. Reviewer findings were
consolidated before final proof and capacity was explicitly approved before execution. Actual DB,
credentials, hosts, port, disk and competing-job preflight passed. The uninterrupted renewed
`pnpm pr:verify` on `d681cf09` passed 1,181 CI contracts, 154 release tests, 41 RLS tests,
3,383 web tests/12 intentional skips, 81.29% lines (21,664/26,649), 252 browser-gate tests/12
intentional skips and 13 smoke tests/11 intentional skips. Same-source security guard passed.
Private full-log SHA-256: `f70961f4caa70a8d259fa25a909155d6a9b7c0c3d49591c593daa6b6def885e9`.
This proof uses the isolated v3 database and supported nip.io route, with source-map upload disabled.
The build-generated declaration change is excluded. Protected checks, current-head review disposition,
expected-head merge and exact-main health remain pending; no gate repair, deployment or successor.

### Final shared navigation delivery

Prepared on base `643b91d5d8863a717895b5dda3d6115d6f82f169`. Sole implementation owner Astra/high;
Sonnet 5 Medium design and Gemini 3.1 Pro adversarial proposals reused from owner handoff.
Five focused test files pass 39 tests, including the existing server tenant-access rejections;
web type-check, changed-file lint and modularity pass. The admin sidebar shrinks to 300 lines,
within its review boundary; its retained role/query/account concerns stay cohesive.
The replacement dashboard tests use real sidebar primitives and add navigation behavior coverage
within their baseline bytes. Independent Astra review identified dark active icons inherited from
the sidebar primitive; the shared renderer now inherits the active link color explicitly. The
corrected source and focused regressions are rechecked before full proof; prepared and tested do not yet mean merged, deployed or user-validated.

Capacity preflight adds one 3,708-byte source file and 598 positive test bytes using measured
unused historical allowances. Transfers: source 2,049 T117B cutover, 1,453 T117C rendering, 206
currency trial; tests 496 CI deduplication and 102 delivery-event coalescing; one unused T117C
file slot. Budget self-growth is exactly 685 config bytes funded from five existing donors.
Global/category ceilings, baseline, reserves, donor path caps and observed evidence remain intact;
no deleted-byte credit or guard relaxation is used. Full inventory/attribution preflight passes.

Local proof uses only task database `shared_shell_nav_2e33` and port 3000, with source-map upload
disabled. Doctor and task-database migration succeeded. Playwright MCP reported `Browser is already
in use for /tmp/interdomestik-pilot-evidence/playwright-mcp-profile, use --isolated to run multiple
instances of the same browser`; that session is preserved and browser validation uses an isolated
fallback. No PR #1769 changes or infrastructure improvements are imported.

The first full attempt at `bc3272bb` passed 1,178 CI contracts, 154 release tests, 41 RLS tests,
81.30% repository line coverage and the production build, then stopped after 111 browser passes:
three unchanged neutral-host tests hardcode port 3000 while that attempt used 3117. Port 3000
was verified free and assigned to this task for the final attempt. That failed run is not a pass.
Supplemental browser inspection also found collapsed padding clipping navigation icons; shared
group/caller collapsed padding and label truncation are corrected before renewed final proof.
The unchanged Sidebar/Radix drawer closes on Escape without restoring toggle focus; independent
source review confirmed that baseline limitation, which this slice does not claim to repair.

Full `pnpm pr:verify` passed at `0bd1d322003c1a4ca0f26d806b31d2ef560688bf`:
1,178 CI contracts, 154 release tests, 41 RLS tests, 3,381 web tests/12 skips,
81.30% repository lines (21,666/26,650), 252 gate passes/12 intentional skips and
13 smoke passes/11 intentional skips. Same-source security guard passed. Private full-log SHA-256:
`5a80e98548ec9fe98c7b687a03f0b6c3e9b459c9786c3eab7ee90712808be928`.
Eight supplemental browser checks pass in KS/sq and MK/mk: desktop/collapsed navigation for
all four roles, mobile drawers for agent/staff/admin and retained member page shortcuts.
Independent Astra recheck cleared the consolidated source. This subsequent ledger update does
not transfer that local proof to a new commit; final-head hosted checks remain required.
The member's existing mobile page shortcuts remain unchanged; shared drawer behavior applies
to consumers exposing a mobile toggle. No all-role mobile-shell completion is claimed.

Product [PR #1770](https://github.com/interdomestik/interdomestik/pull/1770) merged head
`049a6f4b2d8c47d94b71cf4ba8b4195f050c8dd3` as
`8e4abb9272a144e91b27b988b2476f5dd45c9c40` on 2026-09-13. All required hosted PR checks passed.
Exact-main CI `34788807428`, Sonar Main Gate `34788807382`, Secret Scan `34788807371`, CodeQL
quality `34788806958` and CodeQL security `34788807132` passed at that merge. Feedback refresh
`34808850544` later passed and superseded unrelated failed run `34792363977`; no product defect or
delivery gap is inferred. Prepared, tested and merged are recorded; deployment and user validation
are not claimed.

### Optimistic notification acknowledgement candidate

Selected on exact main `8e4abb9272a144e91b27b988b2476f5dd45c9c40`. Sole implementation owner
Astra/high because the mounted component carries concurrent fetch/mutation ordering and subscriber
epochs. T-401 and T-002 are complete; selected main had no production `useOptimistic` use. Claude
Sonnet 5 and Gemini 3.1 Pro both served the requested models on the shared bounded packet. The accepted design
keeps the server-confirmed snapshot canonical, layers optimistic single/bulk read presentation
inside async transitions, and rolls back by omission on typed, thrown or wrong-ID failure. Existing
overlap prevention makes Gemini's proposed concurrent single/bulk request invalid by contract;
subscriber/fetch/navigation counterexamples remain acceptance tests. Server actions, auth/tenant,
claim-status and money/legal mutations are excluded. Five focused notification files pass 39 tests;
web type-check, lint, architecture/modularity/plan audits and executable capacity preflight pass.
The exact proposal changes T410 total 48,728→52,182, source 15,088→15,180, tests 32,438→35,800
and files 6→7; +160 exact budget bytes derive global changes of +3,614 total, +92 source, +3,362
tests, +160 config and +1 file. No deleted-byte credit, reserve, evaluator or unrelated allocation
is used. The owner approved the initial figures on 2026-09-14; final review found the restored
stable allocation ID needs 25 additional config bytes. The owner approved the corrected +3,614-byte
and +1-file global total on 2026-09-14; no broader authority is inferred.
Independent Astra/high final review cleared React transition semantics, concurrency and subscriber
races, bulk-arrival blocking, confirmed navigation, real-Radix focus behavior, bounded scope and
the corrected capacity ledger with no remaining findings. Frozen review hash: `90fdbce57536`.
Repository-owned committed-source review routes bound to `fa37977c`: Sonnet 5 was blocked by the
five-minute no-output timeout (`20260914T074417-sonnet`), while Gemini 3.1 Pro failed when its
configured subscription helper returned `spawnSync agy ETIMEDOUT` after 180.6 seconds
(`20260914T074426-gemini`). Neither route produced a verdict, and neither is counted as approval.
The approved fallback request was not authorized for a different model destination, so no retry or
workaround was used; the independent Astra PASS remains the final code-review authority.
Final product head `32921c88ae4e41a4ce01500866ace884ad08eba9` passed unchanged `pr:verify`:
1,178 CI contracts, 154 release tests, 41 RLS tests, 3,383 web passes/12 skips, 81.30% repository
line coverage, 252 E2E passes/12 intentional skips and 13 smoke passes/11 intentional skips.
Same-head security and five focused files/39 tests passed. PR #1771's first Sonar analysis caught
13 duplicated mock-boilerplate lines and three redundant `act()` wrappers in tests; the test-only
correction retained the real-Radix regression and passed SonarCloud with 0.0% file duplication.
Current-head Codex review found no major issue. Protected merge and exact-main evidence are recorded
in PR #1771; no deployment or broader T-410 completion is claimed.

### Final T410 delivery

Product [PR #1765](https://github.com/interdomestik/interdomestik/pull/1765) merged at
2026-09-13T11:20:02Z: head `abf37e7c62490ebbbf2d2fbb35685b847e17b68c`, squash
`bc4a7fe940b245f57cbc442258b21f6bb5870a7f`, matching tree
`a817b68d7af207b2c89ba5022cf1e9b8570025b9`. Unchanged full `pr:verify` exited 0:
1,048 CI contracts, 154 release tests, 41 RLS tests, 3,371 web passes/12 skips,
81.24% repository lines (21,650/26,649), 252 browser passes/12 intentional skips,
13 smoke passes/11 intentional skips. Both neutral-IDA keyboard variants and same-head
`security:guard` passed. Private full-log SHA-256:
`3856a5b1cfa538b8fbe173c903212531272f986a676083a8680fe56a4a6a6bd4`.
Focused owner proof passed 41 web/four domain tests; independent Astra passed 38 web/four
domain tests and cleared production plus exact capacity bookkeeping. Final automated review's
unallocated-growth claim was disproved by wrapper size 2,917→2,915 bytes; its ledger concern was
dispositioned with explicit source binding and the completed final proof. All threads were resolved.
Hosted CI `34753060459`, E2E `34753060419`, pilot `34753060446`, Sonar check `103713465685`
and strict `pr:review-ready` passed. Finalizer `34753060461` and delivery `34753060433` passed
attempt 2 after the two review threads were resolved; initial failures remain historical evidence.

Exact-main [CI](https://github.com/interdomestik/interdomestik/actions/runs/34754164766),
[SonarCloud analysis](https://api.github.com/repos/interdomestik/interdomestik/check-runs/103716794800)
and [Sonar Main Gate](https://github.com/interdomestik/interdomestik/actions/runs/34754164793) passed.
The task-only database was removed after zero clients, its inactive port reservation released,
and proof/configuration retained privately. No shared database/container/profile was removed.
The owner directly approved committing the exact 2,529-byte adjustment in the product task after
relayed authority was rejected. No further ceiling change is made here. This authorized two-file
transcription follows #1764 without creating a routine closeout policy. No deployment, claimant
usability validation, redesign, broader T-410 completion or successor selection is claimed.

### Historical source-bound progress

The notes below retain earlier proof and then-pending states; final completion is recorded above.

Historical staff rehearsal: retained only as a timing baseline; no migration credit.

Harness adoption completed through PR #1761 merge `a1eaeb654` and PR #1762 merge `12b22bada`;
its completed history is retained in the current program, outside the single active queue.

T210 is medium complexity: bounded UI integration and privacy/fallback regression coverage over an
unchanged authorized query. Implementation owner: Sol/high. Sonnet 5 reviewed snapshot `fa959214`
and found only prepared-versus-live wording ambiguity, which was clarified without expanding
visibility.
Gemini 3.1 Pro proposed adversarial cases; three useful cases were integrated, duplicate cases and
an incomplete mapper fixture were rejected. The resulting 24 focused tests pass. Both repo-owned
route receipts are retained in the task workspace. Independent Astra review and local `pr:verify`
passed at `061ea5910ea63aab67009bccfb2b219505733fa9` (773,700 ms, exit 0; gate 252 passed/10 skipped,
smoke 13 passed/11 skipped; repository line coverage 81.09%). Same-source `security:guard` passed.
The subsequent tracker-only enum correction does not change product code; that local proof remains
bound to its original source. Final product head `87c291f21d74c9a1dfd8d92683124c29af89f4f7`, tree
`a24e6b186f829994a693eb89fb95981e5db024e9`, and squash merge
`00794c98cc6b4d395493370552ab7b9eae525db7` matched. Final-head focused review found no unresolved
issue. Protected-main CI `34703433627` passed, SonarCloud Code Analysis check `103580834614`
passed, and Sonar Main Gate `34703433721` attempt 2 passed at the exact merge. No deployment or
claimant usability validation is claimed.

T410 local source-bound proof passed at `af64f73c82164a6189a93be7bdcd9b0af1c10a19`:
61 focused notification/domain tests (57 web and 4 domain), both focused IDA-host browser variants,
`pr:verify` (1,048 CI
contracts, 154 release-gate tests, 41 RLS tests, 81.25% repository line coverage
(21,643/26,637), 252 gate passes with 12 intentional skips, and 13 smoke passes with 11 intentional
skips), and
`security:guard`. Repo-owned routes completed Claude Sonnet 5 design and Gemini 3.1 Pro/Gemini 3.8
Flash test-screening proposals against specification commit `adc3ca314`; those receipts informed
implementation but are not current-head implementation-review evidence. An earlier independent
Astra implementation review passed at `833496eb`. Later externally reported findings were
reproduced and corrected, including bounded bulk responses, locale-safe action routing, disabled
pending actions, Serbian glossary consistency, semantic status output, and explicit tenant/user
predicates without the deprecated helper overload. The changed E2E corpus fingerprint is bound in
the fixed-capacity CI evidence allocation without increasing the repository ceiling. The corrected
behavior is covered by the new source-bound proof. Bulk acknowledgement still updates the full
tenant/user unread backlog and the client changes represented requested rows only after server
confirmation. This is implementation
and scripted behavior evidence only: current-head protected review, protected PR checks, and merge
remain pending, and no legacy visual approval, claimant usability validation, or deployment is
claimed.

The 2026-09-13 concurrency correction is HIGH complexity, owned solely by Astra/high under the
chief's reassignment. At `38dda40d82eb26b5bfa8bc25f3f0b36b722ce51b`, the real Suspense regression
passes after failing on the render-phase mutation baseline. Claude Sonnet 5 and Gemini 3.1 Pro
both reviewed that correction through the repo-owned routes, with configured and served models
reported as matching by the receipts. Subsequent inspection found that the local Gemini wrapper
copies the requested model name into its response and maps calls through `agy`; its served model
is therefore unverified. Retained Gemini/Flash outputs are advisory proposals, not independent
model-identity evidence. Flash's invalid direct component-invocation proposal was rejected.
Current-review findings concerning duplicate fetches, failed-fetch truth and successful action
navigation are consolidated at `b5e67972e05a6108b2bbd39588a97ab6f4312371`; 32 focused web tests
and four domain tests pass. Claude Sonnet 5's native receipt at `20260913T043700-sonnet` reports
PASS on that source. Independent Astra source review found no actionable implementation defect,
was advisory while verified Gemini contribution was required. Earlier full proof remains bound to
`af64f73c82164a6189a93be7bdcd9b0af1c10a19` and does not certify these subsequent changes.

The official installed Gemini CLI 0.56.0 was tested separately from the wrappers using the
existing repo runner, subscription OAuth, deny-all admin policy, extensions disabled, and a
non-private probe with automatic context, hooks, MCP, IDE and telemetry disabled. Its native
policy engine denied file-read, write, shell, web-fetch and MCP-shaped calls under the repo rule.
The network-enabled probe failed before a model response with `IneligibleTierError` /
`UNSUPPORTED_CLIENT`: Google no longer supports this client for this account's Code Assist
individual tier and directs it to Antigravity. Receipt `20260913T045420-flash` retains the exact
error (exit 55, 2,787 ms); no private candidate packet was supplied to that probe. This does not
establish native Flash availability or served identity. The chief was notified; final proof and
delivery were paused pending a supported, verifiable Gemini route. Existing owner export
approval stands; no new approval request, paid fallback or global tooling change was made.

On resumption, the authenticated Antigravity catalog listed Gemini 3.8 Flash Low/Medium/High.
A non-private arithmetic probe pinned to `gemini-3.8-flash-low` returned native `SUCCESS`,
the correct answer, and real usage in 10,331 ms (`20260913T050734-flash`). This establishes
connectivity, not accepted review evidence: native init reports the requested model, while the
existing receipt parser rejects the different event shape as `provider model unattested`.
The requested workspace no-tools agent was not discovered: the native log reports fallback to
the default agent despite init echoing the requested agent name. Both documented Markdown
locations and a Git boundary initially failed discovery; explicitly adding the temporary
directory with `--add-dir` then exposed both agents. Paired capability tests show effective
tool exclusion: a neutral `tools: []` agent could not read a public canary and emitted no tool
events (`20260913T051304-flash`); the identical prompt with only `view_file` permitted produced
native file-read events and returned the canary (`20260913T051405-flash`). Both used resolved
custom agents. Native init enumerates the global tool inventory, not this effective distinction.
No private review packet was sent in these diagnostics. The chief has the minimal task-local
adapter proposal. Its task-local parser passes 16 negative/identity tests and correctly rejects
the real positive-control tool stream. The chief accepts native pinned/no-fallback execution
as operational evidence by explicit inference, not independent server attestation. The unchanged
repo runner cannot represent that distinction: Google routes require a non-null matching
`providerReportedModel`. No model field or provider label was fabricated to evade this check.
Separate runner evidence-representation work was isolated from T410 and remains parked at
`5705cdd3130ed928df3cb991d629873de009471d`; its worktree and raw receipts are preserved,
with no tooling imported into this product branch.

On 2026-09-13 the owner directed: "Skip them ise astra model and complete the slice".
This explicitly waives both Claude and Gemini review requirements for this notification slice
only, not future work or required protected checks. Astra/high remains sole implementation
owner. Fresh independent read-only Astra final review found no actionable blocker or hardening
against production head `b5e67972e05a6108b2bbd39588a97ab6f4312371`, including all substantive
PR #1765 review bodies and inline findings. Independently executed 28 web and four domain tests
passed; the reviewer also checked the frozen diff. No provider failure is relabeled as approval.
Renewed source-bound `pr:verify`, security/E2E, current-head review disposition, protected merge
and postmerge health remain required. The single IDA entrance and unified capability shell
remain settled requirements; legacy visuals are behavioral evidence, not a redesign target.

Renewed full `pr:verify` passed on `045b0c7ee609776613ff47a076bf47ce1ec7660c`
(649,494 ms): 1,048 CI contracts, 154 release-gate tests, 41 RLS tests,
81.24% repository line coverage (21,651/26,651), 252 browser-gate passes/12 intentional
skips and 13 smoke passes/11 intentional skips. Both focused neutral-IDA notification browser
variants passed on the same build (3.8 seconds); same-head security guard passed. All DB URLs
used a unique task-owned database, not shared `postgres`. An initial run was interrupted at an
inherited Sentry source-map upload (exit 143; remote upload effects unknown); the successful
run explicitly disabled artifact upload through existing local-build environment controls and
retained every required verification phase. Full successful log SHA-256:
`265bc738253be31ddbccdcac6b671f506c0ddf9748368b980583597e1226aa9a`.
The automatic generated `next-env.d.ts` import was restored to its pre-build tracked form;
no notification source changed. This ledger update does not transfer local proof to a new head.
Current-head hosted checks, review disposition, protected merge and postmerge health are pending.

Review of `aed9f024` found two reproduced fetch issues after that successful proof. The action
now propagates authentication failures instead of returning an empty list; invalidated fetches
schedule one coalesced fresh request for the current subscriber epoch. Single/bulk arrival
regressions failed before the fix. An explicit zero-row domain test preserves idempotent bulk
success without an unbounded ID response; the proposed zero-count failure rule was rejected
because a concurrent tab can legitimately have read the entire backlog. Concurrent deletion is
not distinguishable from already-read state by affected-row count. This rejects count-based
failure semantics; later bounded post-bulk reconciliation below also removes stale snapshot rows.
Independent Astra review cleared the production correction before final proof; focused test
setup was then consolidated without losing failure, subscriber or arrival scenarios. Further
capacity transfers 270 unused topology-test bytes and 220 unused currency-trial bytes (100 source,
120 tests) into T410, retaining every global/category ceiling, file allowance and reserve. The
wrapper regression has no byte growth. Earlier local/hosted passes remain bound to their old
source; the corrected candidate still requires fresh full verification and protected merge.

Full `pr:verify` passed at `61e17a02a9c8091438b7789d824ce1656ffcb163` in 646,480 ms:
1,048 CI contracts, 154 release tests, 41 RLS tests, 81.24% lines (21,649/26,648),
252 browser passes/12 intentional skips and 13 smoke passes/11 intentional skips. Log SHA-256:
`252fb44f50d4890788c443c23febf5e6ff1cecf6380ab00d75abc29bbe63a6dc`.
The run remained undisturbed while current-head review `5190033096` identified a bulk ordering:
a fetch may add a row during acknowledgement and finish before the bulk result, leaving that row
outside the captured update. The correction always requests coalesced bounded reconciliation
after successful bulk acknowledgement. New regressions failed before this one-line fix; the
expanded suite passes 41 web/four domain tests. Wrong-ID success is refused, late arrivals retain
their authoritative unread state, reconciliation failure preserves confirmed state and exposes
explicit retry, and old-subscriber success cannot initiate a replacement-subscriber fetch.
Fresh independent Astra review cleared the production correction and interleaving matrix;
its narrower independent execution passed 38 web/four domain tests. Final-source proof was then
pending and subsequently passed at `abf37e7c`; the `61e17a02` run is not transferred to changed code.

After runtime rejected broad completion authority for a capacity-ceiling change, the owner
explicitly approved the exact 2,529-byte adjustment in the chief task. T410 test allocation
increases 29,940→32,438 (+2,498), source 15,058→15,088 (+30), total 46,200→48,728.
Affected test path limits become 11,537 and 3,052 bytes of baseline-relative growth. One byte
of budget self-size is recorded in the existing exact allocation. Conservation requires derived
global limits 61,180,374→61,182,903 total; 7,011,796→7,014,294 tests;
8,817,624→8,817,654 source; 2,228,283→2,228,284 config. This exact owner-approved
maintenance preserves positive-only accounting, baseline, reserves, file caps and other owners;
no deleted-byte credit, extra buffer or evaluator change is used.

Capacity for the consolidated regressions transfers 4,750 observed unused bytes into T410:
3,820 from T117C rendering (1,500 source and 2,320 test bytes), 370 test bytes from T117B cutover,
460 test bytes from CI deduplication, and 100 test bytes from the completed currency trial.
The aggregate/category ceilings, reserve, file count and writer scopes remain fixed; all donor
allocations remain above their measured usage. Unused Supabase channel mocks were removed from
the existing notification test without removing assertions.

Terminal: promotion `#1691`; product head
`503d4b179251f9d3d06e07349ec80f85805565ae`, tree
`61b2316606c9b3facd6c8aff2a14bb4402d80c82`, squash
`31cae997e42dbc0bee13ca670899b988576bd42c`; Full Gate `33863200404`, CI `33863200381`, Pilot
`33863200495`, backstops `33863200850`, security `33862616690`, finalizer `33863200356` attempt 2,
delivery `33863200387` attempt 2, main CI/Sonar/CodeQL/security green; CD
`33865541227` cancelled, zero jobs.

T117C product: #1736, head `f13c81712d5fa012c6407337852217473a1c4d4d`, merge
`c3e79d91d103c373ac9014d136956e8d91815991`. CI `34452735233`, E2E/smoke
`34452735175`, Pilot `34452735196`, finalizer `34452735368`, delivery
`34452769704` attempt 2 passed. Owner review `5164184965` binds promotion #1738.
The 50-path product is a subset of the 53-path admission. Protected-main CI `34454527870` and Sonar `34454689720` passed at the exact merge.

Migration rehearsal: promotion #1749; product #1744 head
`b9128de3b787e26eb08935a4d85cc7580398d6cd`; exact executed merge
`be7f1d9f794f4faf338b11dfdfd43e43fe469076`, tree
`0528a173b2d29d2f5d09e4e066467f513607ca4e`; Z620 `e2e-pr` PASS in 1,548,982 ms. Result SHA-256
`5d15d07e940511665631d8819ce72345c49ea1b5885e7372a269850270d2fc59`; log SHA-256
`c5ab7f1ac1898f1b82b23d400b7ae8465b7143c0ee29fa9446e6a1a3285718d9`. Existing protected-main
evidence was reused. The task database, port, process scope and temporary checkout were cleaned.
Because live activation and the repo-bound prospective protocol did not both precede merge and
execution, this is a technical baseline rather than trial 1. Migration was 0/3 at that checkpoint.

The historical protocol for completed migration trials 2 and 3 is defined in `current-program.md`: each trial
uses one bounded ordinary product PR while Lean authority remains inactive, with exact identity
frozen before its clean detached Z620 run. Existing protected PR evidence is reused when inputs
match; the result, redacted log, hashes, duration and cleanup state are retained. Missing
pre-execution binding or cleanup means no trial credit.

Failed-run retry product #1757 passed all protected PR contexts and its exact-head Z620 `e2e-pr`
lane in 1,551,834 ms. Result SHA-256 is
`4ad149d001623f5ba63dfb8609e849704e4c26583695c5558e585177a52d0ad6`; log SHA-256 is
`cb44f5d3b3af05b391141a24f31419f35c1f23d444e02fc87aa254469a7516ea`. Task resources and the
temporary candidate were cleaned, evidence was retained, and exact source
`4a6ebbed9bb8a942d707ad81cef57fcede02dd63` squash-merged as
`1728afd3c76f952de9a6df87502800965e041093`. Migration progress at that checkpoint was 2/3.

Unsupported-document product #1758 merged head
`0819504edd2124ce4606e6102d980d78c2279ec4` as
`d54fa720ba812ade5584ada9ab51aa02a9fc0c46`; head/merge tree matched
`145260744f66eee7ecef50d24b1873d181fa71c3`. The corrected prospective Z620 run
passed in 1,553,241 ms with task-resource cleanup; result/log hashes and the
execution owner's exact-main verification are recorded in the current program.
Migration is completed at 3/3. This is not production-deployment evidence.

## Next Selection

T117C was delivered by promotion #1738 and product #1736. Its legacy projection remains inactive.
Harness adoption completed through #1761 and #1762. T210 completed through product #1763. The
owner-selected bounded notification acknowledgement increment completed through #1765 with exact-main
health verified, and shared shell navigation completed through #1770. `T410-OPTIMISTIC-NOTIFICATION-ACK`
completed through protected product PR #1771, and the bounded
`T410-PESSIMISTIC-MUTATION-BOUNDARY` protected-merged through PR #1772 as `62376c15`. This does not
claim full T-410 completion. `MEMBER-CASE-OVERVIEW-ENTRY` is the owner-selected member-journey
successor over T-116/T-117/T-118; it does not select the T-411 Smart Next Step framework.

| Completed historical priority            | Status      | Constraint                                                                    |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Locale-aware currency parsing            | `completed` | Product #1754; migration trial 1/3 closed.                                    |
| Bounded failed-run retry                 | `completed` | Product #1757; migration trial 2/3 closed.                                    |
| Unsupported claim AI document type       | `completed` | Product #1758; migration trial 3/3 closed.                                    |
| Member timeline (T210)                   | `completed` | Product #1763; main CI and Sonar passed at the exact protected merge.         |
| Notification acknowledgement correctness | `completed` | Product #1765; exact-main CI/Sonar passed; no broader T-410 completion claim. |

The active successor is recorded in the queue above. No later recommendation becomes program
priority until the owner selects it and the current program records that decision.

## Lean Authority

<!-- prettier-ignore -->
```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "inactive",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": null
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator.

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
