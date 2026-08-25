---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-25
---

# Lean Tier 1–2 Authority Bootstrap — Tier 3 Design

> Status: Pre-approval candidate for one repository-native governance installation. It grants no
> product runtime until merged, healthy, and followed by a separately approved Tier-0 promotion.

## Identity and sole outcome

- Slice: `IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP`.
- Risk: Tier 3 governance and runtime-authority infrastructure.
- Sole outcome: install one fail-closed repo validator that can authorize one bounded Tier-1/2
  product branch only after a protected-main promotion PR.
- Exit state: validator installed, program/tracker agree, `runtimeAuthorized:false`,
  `activeSlice:null`, and no successor promoted.

## Authority boundary

`scripts/lean-current-authority.mjs` is the sole public facade and conformance CLI. Its repo-owned
policy/schema, lifecycle, closeout, Git/GitHub primitive, first-parent history, and
repository-evidence modules form one closed validator boundary; none is a second policy owner.
`pnpm plan:status` delegates to the facade. The external skill `next-slice` may read the CLI later
as operational convenience, but its absence, staleness, or output can neither grant nor block
runtime.

WF01 projection, envelope, receipt, durable history, exact-delivery proof, and archive manifest
remain byte-unchanged historical evidence. They are not resolver inputs and cannot activate Lean
authority. MCP, A→B→A, models, memory, Docker, and local processes are advisory or execution
surfaces only.

## Exact bootstrap writer-map

The real repository inventory increased, so synchronization produced a budget diff. The
consolidated authority-remediation candidate uses exactly the following 21 repository paths with
no optional writer:

1. `docs/plans/2026-08-25-lean-tier12-authority-design.md`
2. `docs/plans/2026-08-25-lean-tier12-authority-admission.json`
3. `docs/plans/current-program.md`
4. `docs/plans/current-tracker.md`
5. `scripts/lean-current-authority.mjs`
6. `scripts/lean-current-authority-policy.mjs`
7. `scripts/lean-current-authority-lifecycle.mjs`
8. `scripts/lean-current-authority-closeout.mjs`
9. `scripts/lean-current-authority-git.mjs`
10. `scripts/lean-current-authority-history.mjs`
11. `scripts/lean-current-authority-evidence.mjs`
12. `scripts/lean-current-authority.test.mjs`
13. `scripts/lean-current-authority-policy.test.mjs`
14. `scripts/lean-current-authority-conformance.test.mjs`
15. `scripts/lean-current-authority-evidence.test.mjs`
16. `scripts/ci/lean-current-authority-contracts.test.mjs`
17. `scripts/plan-status.mjs`
18. `scripts/plan-status.test.mjs`
19. `scripts/current-authority-format-audit.mjs`
20. `scripts/current-authority-format-audit.test.mjs`
21. `scripts/repo-size-budget.json`

The nine-path increase over the default admission budget is structural remediation, not added
behavior: six paths replace the 300-line mixed-concern implementation with bounded policy,
lifecycle, closeout, Git/GitHub, first-parent history, and evidence modules behind the unchanged
facade; one path keeps policy tests cohesive, one keeps real Git/GitHub evidence fixtures below
their 300-line contract, and one delegates the complete Lean contract set through the existing CI
contract lane. Splitting these modules into a later PR would leave the authority candidate
incomplete, while landing them without the gate/admission and projection consumers would create
an unverified policy owner.

No product, UI, dashboard, auth, tenant, proxy/routing, schema/RLS, billing, AI, CI workflow/E2E
semantics, Docker, external skill, AGENTS, README, architecture, WF01, or dependency file is
admitted. The new `scripts/ci` file is a tested Node contract loader; it changes no lane policy.

## Flow 1 lifecycle

```text
inactive
  -> promotion_pending
  -> awaiting_product_branch
  -> active_implementation
  -> consumed_on_merge
  -> no_active_slice
```

1. A Tier-0 promotion branch starts at exact protected main `B0`. Program and tracker record one
   Tier-1/2 slice, promotion PR number/base, expected product branch, gate/admission bindings,
   product writer-map, and the exact two-path success/failure closeout map.
2. The promotion PR exact head `Hp` receives one canonical owner approval bound to `Hp` and
   `tree(Hp)`. Its dynamic squash output `Mp` is accepted only when `parents(Mp)=[B0]`,
   `tree(Mp)=tree(Hp)`, and protected main equals `Mp`.
3. On protected `Mp`, the state is `awaiting_product_branch` with runtime off. Only the exact
   `expectedProductBranch`, forked from `Mp`, may enter `active_implementation`.
4. The unique product PR must target `Mp`, use the expected head ref, and change only approved
   Tier-1/2 writer paths. Every changed head restarts exact-head proof.
5. Intended squash merge `M` is accepted only when `PR.base=Mp`, `PR.head=H`,
   `parents(M)=[Mp]`, `tree(M)=tree(H)`, and protected main equals `M`.
6. Recognition of `M` immediately returns `runtimeAuthorized:false`, `activeSlice:null`, and
   `consumed_on_merge`. Closeout is a deterministic projection, never a second runtime lease.

## Approval identity

The later product-slice approval is one structured GitHub review on promotion head `Hp`. The body
must exactly equal the versioned canonical marker plus one canonical JSON line binding slice,
`B0`, `Hp`, promotion tree, gate/admission, expected branch, product writer-map, and closeout map.
No leading/trailing text, duplicate marker, alternate normalization, or extra field is accepted.

The review must have `commit_id=Hp`, state exactly `COMMENTED`, exact login `arbenl`, and verified
GitHub numeric user ID `62884977`. `author_association` is ignored. Exactly one matching review is
required; a stale head, duplicate marker, different login or numeric ID, or merely human-looking
text fails closed.

The separate Tier-3 approval for this bootstrap installs the validator only. Each later product
slice receives one independent approval covering its promotion PR, product PR, and deterministic
closeout; these approvals do not form a WF01-style chain.

## Continuation rule

Temporary authority is usable only when canonical origin and Git common directory are trusted,
protected main remains `Mp`, local branch equals the recorded product branch, its fork point is
exactly `Mp`, and its diff is a subset of the frozen product writer-map. After PR creation there
must be exactly one matching PR with `base.sha=Mp`; the validator binds its current exact head as
`approvedHeadSha` for validation.

Product writer paths exclude program, tracker, validator, gate, admission, and all governance
surfaces. Therefore the product branch cannot create or modify the projection that authorizes it.
Every other branch returns `wrong_continuation_branch`; a reused/multiple PR identity, wrong fork,
wrong base, stale head, or writer drift blocks runtime.

## Fail-closed classification

Deny rules run before allow rules. Protected families include authority/governance; auth and
shared-auth; tenant/access/legal context; proxy, middleware, and routing configuration; database,
schema, migrations, SQL, and RLS; billing/payment/Paddle; AI/model/prompt/eval; CI, delivery,
E2E, Playwright, and Docker; dependency manifests/lockfiles; AGENTS, README, architecture, and
malformed paths. Only named UI page/state, component, style/token, i18n, and package UI classes can
resolve as Tier 1/2. Domain packages remain protected by default and require separate higher-risk
authority. Every unmatched path is `unknown` and blocked.

Protected tokens are matched at every slash, dot, underscore, and hyphen boundary, not only at the
start of a path component. A nominal UI component such as `member-access-card.tsx`,
`member_access_card.tsx`, `stripe-checkout-card.tsx`, or `ai-assistant.tsx` therefore remains
protected rather than inheriting the component allowlist.

Route-group auth pages such as `(auth)` and auth/legal/commercial-terms message bundles are
explicitly protected even when their filenames otherwise resemble allowed page or i18n classes.

Writer paths must be relative, unique, traversal-free, slash-normalized, within the approved map,
and at most 12. Skipped, missing, duplicated, or malformed evidence is failure.

## Failure and closeout semantics

- Promotion closed without merge never activates and requires no successor.
- Promotion parent/tree/base mismatch, incomplete file inventory, gate/admission hash mismatch at
  the exact promotion head, or any changed path outside the exact current program, tracker, one
  dated gate/design, and one dated admission leaves runtime off.
- Product `CLOSED && !merged` from live GitHub state immediately overrides document projection,
  returns `activeSlice:null`, blocks successors, and permits only failure closeout before head
  commit-tree, file, review, or projected-state completeness can interfere.
- Closed-unmerged precedence requires an exact boolean `merged:false`; missing, null, string, or
  numeric merge values are malformed evidence and authorize neither runtime nor closeout.
- Open or merged product file inventories that are incomplete or outside the frozen writer-map
  disable runtime and authorize only deterministic failure closeout; oversize is policy failure,
  never a collector exception.
- A protected-main value other than `Mp` while active is `foreign_main_advance` unless it is the
  exact intended `M`; runtime is disabled and only failure closeout remains.
- Exact intended `M` consumes authority before program/tracker persistence.
- The deterministic closeout branch is `<expectedProductBranch>-closeout`, forked from the terminal
  anchor. Live resolution reads the prior active projection from that anchor, verifies the exact
  terminal state, and admits only the two frozen projection paths.
- Closeout may start from a later main only when terminal merge/anchor is an ancestor and neither
  authority document was touched afterward, including an edit that was later reverted. Its
  complete GitHub file inventory must be exactly current program plus tracker; squash parent/tree
  and protected-main identity must match.
- Success and failure closeout both end `runtimeAuthorized:false`, `activeSlice:null`, with no
  successor. Authority-path drift blocks the projection but cannot restore consumed runtime.
- Missing or malformed repository identity and historical anchor evidence is blocked. The only
  bootstrap exception is an absent Lean block at exact frozen parent
  `87f6dcc91e33abe51169fc95064fc585bd10d064`; it yields exact no-active state and cannot recur
  on any other parent.

## Future UI constraint carried by this projection

Current program preserves the evidence-backed Unified Portal direction as a compact, inactive
Tier-2 design constraint, while the tracker records only `T-118` as the next unpromoted design-gate
branch. This bootstrap neither activates that branch nor changes product UI. A later gate must
honor the shared responsive shell, capability navigation, Case → Actions → Timeline core,
`T-118 → T-117 → role/task views` sequence, existing design system, and M1–M5 architecture.

## Sonar remediation disposition

All ten annotations on superseded head `fdef04e0ad78efd2a0a4d1fed9f8d4e3b1e625c1` were inspected
against the exact source:

| Original line | Count | Classification                                                                              | Consolidated repair                                                                                                                                  |
| ------------- | ----: | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18–19         |     2 | Evidenced style false positives on path-boundary alternation; no observed allow/deny defect | Replaced the broad alternations with explicit segment/token matching and added protected-token regression cases.                                     |
| 28            |     2 | Actionable implicit ordering in set comparison                                              | Removed sorting from set equality; uniqueness and membership are checked directly.                                                                   |
| 29            |     2 | Actionable implicit/alphabetical ordering contract                                          | Removed key sorting from schema equality and introduced one explicit locale-bound comparator only where ordered path output is required.             |
| 111           |     1 | Actionable cognitive-complexity hotspot                                                     | Extracted pull-state precedence, merged-product, open-product, and local-continuation transitions into pure lifecycle helpers.                       |
| 194           |     1 | Actionable ambiguous one-line conditional                                                   | Added an explicit braced multiple-PR rejection before the single/empty selection return; the existing 0/1/multiple regression remains authoritative. |
| 212           |     1 | Actionable implicit path ordering                                                           | Git changed-path evidence now sorts with the explicit canonical comparator and has a focused ordering regression.                                    |
| 252           |     1 | Actionable cognitive-complexity hotspot                                                     | Split repository identity, GitHub primitives, prior-terminal evaluation, pending closeout, and merged closeout into cohesive evidence modules.       |

No issue is suppressed, marked wont-fix, or handled by lowering a threshold. The false-positive
classification describes absence of a behavior defect in the original regexes; their reported
constructs are still removed so the new candidate does not rely on that classification.

The subsequent Sol High adversarial review found five authority blockers in the superseded
candidate. This candidate revalidates every inactive projection through its bounded first-parent
active→inactive transition, requires complete closeout inventories, detects authority-path touches
even after edit→revert, hashes the exact promotion-head gate/admission blobs, and deny-lists
commercial-terms spellings with camel, hyphen, or underscore separators.

The final Sol review also rejected dereferenced Contents API evidence. Promotion artifacts now
resolve through the exact `tree(Hp)`, require unique regular `100644` blob entries, fetch those blob
identities through the Git Data API, and hash only their decoded bytes; a symlink-mode fixture fails
closed.

The first exact-head Sonar run on `72b3221c98c914cd56ccb973646feb1ff0cf6f5d` then surfaced 14
new-code annotations despite a green Quality Gate: twelve direct-re-export findings in the facade,
one redundant regex escape, and one import-only CI-wrapper finding. The consolidated repair uses
direct `export … from` declarations for the twelve public symbols, the canonical unescaped slash
class, and an explicit wrapper contract that loads the exact six test modules once. Conformance
locks both source-shape repairs. No Sonar issue is suppressed, accepted, or marked false positive.

## Proof and acceptance

Forty-two focused Node contracts cover canonical program/tracker agreement, bounded module
separation, explicit ordering, protected-token classification, the exact bootstrap-parent
exception, unique owner/login/ID/marker/head
binding, deny/allow/unknown classification, exact promotion and product parent/tree equivalence,
list-summary to full-PR expansion, expected branch/fork, product self-authorization rejection,
stale heads, closed-unmerged precedence, foreign-main advance, immediate consumption, exact live
closeout, WF01 non-activation, trusted origin identity, and external skill irrelevance.

The denylist regressions include protected tokens embedded after an ordinary component prefix. The
closeout regressions require lowercase GitHub state plus an exact boolean `merged` value before
abandonment can be authorized; missing, null, string, numeric, or contradictory evidence blocks.

Temporary Git fixtures exercise real commit trees, parent arrays, ancestry, active→inactive
history, and authority-path edit→revert drift. GitHub response fixtures cover full PR
base/head/merge responses, bounded review/file inventories, review identity, exact-head artifact
tree entries, blob bytes and hashes, symlink rejection, changed paths, and unique downstream PR
selection. The promotion collector attaches its complete changed-file inventory and hashes its
exact regular gate/admission blobs before lifecycle evaluation. The live CLI and default
`plan:status` use the same fail-closed resolver;
explicit `--document-only` status and conformance modes are non-authoritative mechanical views.
One tested `scripts/ci/lean-current-authority-contracts.test.mjs` loader makes the same 42 contracts
part of the existing `test:ci:contracts` command without changing package or workflow configuration.
Mechanical proof includes formatter write/check, focused tests, conformance, plan/status/audits,
docs verification, scope and repo-size checks, security guard, CI contracts, exact-head required
contexts, and one bounded Sol High review after mechanical green. Heavy parity belongs on
GitHub-hosted Ubuntu; no local Docker/browser proof is required because this slice changes no
product surface.

Observed `2026-08-25T10:34:25Z`: GitHub API protected main and `git ls-remote` both returned
`87f6dcc91e33abe51169fc95064fc585bd10d064`; repository policy was squash enabled with merge-commit
and rebase disabled, and authenticated owner identity was `arbenl` / `62884977`.

The public facade remains the sole import surface. Policy/schema, lifecycle, closeout, GitHub/Git,
first-parent history, and repository evidence are cohesive internal modules, each bounded to at
most 200 physical lines after canonical formatting. The conformance suite locks that topology so
collector or I/O logic cannot drift back into the policy owner. Complexity, duplication,
security, formatting, and coverage gates remain mandatory.

## Rollback

Revert only the exact bootstrap merge. The prior repository then resolves to its existing
no-active, WF01-closed state; no historical artifact is rewritten or revived. If the bootstrap
merge is unhealthy, no product promotion is allowed, CD/provider effects are recorded and
contained, runtime remains off, and cleanup stops under incident authority when containment is
uncertain.

## Residual risk

The GitHub collector requires authenticated read access to PR reviews and commit objects. Missing,
rate-limited, malformed, paginated-at-ceiling, ambiguous, or longer-than-30-second subprocess
responses fail closed. Local execution also requires the canonical origin plus a valid repository
common directory. The 12-path product budget is a hard Lean limit; a larger or protected slice
requires separate authority rather than a waiver. Historical inactive resolution searches at
most 128 first-parent commits; a longer unresolved authority interval fails closed rather than
trusting an unverified projection.
