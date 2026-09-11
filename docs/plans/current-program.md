---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-11
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document alone defines the current repository execution phase, committed
> priority, and sequence. Detailed contracts remain in the linked content-addressed artifacts.

## Current Phase

Migration trials 1–3 are complete. The owner-approved next work is bounded harness
repair and adoption of ordinary protected-PR delivery, followed by a separately
selected product increment. T210 is prepared, not activated. Package-command PR
#1759 and QA-runtime recovery are separate work; their completion is not assumed.

## Delivered History

`IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP` completed in PR `#1629`: approved head
`2845d36523f9f4f186f595336d9b3cd0d5158b00`, tree `3657eac816f4ce16678b68f74fff2f5a1a389593`,
and squash `9f35b2eaf4904f8c0a02542632b51a92f8df4d3e` matched. Nine checks, 12/12 threads,
zero-issue Sonar, and main were green; CD `32860119345` stopped pre-build with zero effects.

`IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` completed in PR `#1634`: approved head
`6d7430b53dae921c2835e2729a322aece326812b`, tree
`fe087d45535aca6797ecd83172d90ba8a730442d`, and squash merge
`92abb4ba4f7db614840357ebb5ad4dc99b9ee21e` matched the frozen base/tree. The public entry door is
now Header, HomePageRuntime (canonical Hero V2, Free Start, and preserved session/analytics),
PricingSection, then Footer. Eight legacy sections are reversibly unmounted; their files and E2E
contracts remain unchanged. Nine required checks, the broad E2E gate, pilot gate, Sonar, focused
unit/browser evidence, and exact-main identity were green.

`T-118-CRYSTAL-PRIMITIVES` completed through promotion `#1637` and product `#1638`. Head
`449832314edad1706fc31d9688c13c5cdc302fe2`, tree
`26f300fedc342b477c1bd1ad79a17611f950d26c`, and squash
`79defe7af8d22dc26d78f4845a321f8906720794` matched the ten-path allocation. The presentational
primitives remain unmounted; exact proof and main were green. `#1636` remains the capacity proof.

`T-117A-UNIFIED-PORTAL-SHELL` completed through promotion `#1641` and product `#1642`, using its
[gate](./2026-08-27-t117a-unified-portal-shell-design-gate.md),
[admission](./2026-08-27-t117a-unified-portal-shell-admission.json), and allocation. Head
`86b9609d388b6dcab597cf7f6a6ebddd2fa00be7`, tree
`5bd0aa814a48aa722e1760f9c2f0cc4602a28ae7`, and squash
`a99d30903e1a6a36fad811992349384db05331a8` matched. The accessible presentational shell remains
unmounted; exact proof and main were green. `#1640` remains the capacity proof.

`T-116-CASE-SUMMARY` completed through promotion `#1646` and product `#1647`, using its
[gate](./2026-08-27-t116-case-summary-design-gate.md),
[admission](./2026-08-27-t116-case-summary-admission.json), and allocation. Head
`860c240e48024f2757d633589148d945e02595b4`, tree
`ff1077ee9be1f4ce399919fcdb42882469e3038d`, and squash
`cde8af2c95915b0d6aa7555bb26b94249edbdfaf` matched. Its tenant read projection and pure renderer
remain unmounted; exact proof and main were green. `#1644` and `#1645` remain prerequisite proofs.

`T117B-DATA` completed through re-promotion `#1661` and product `#1658`, using its
[gate](./2026-08-28-t117b-data-design-gate.md),
[admission](./2026-08-28-t117b-data-admission.json), and allocation. Head
`b9e735535ae812c0824ecb7e7a874fe78e78303d`, tree
`728768ab05bc47a0f1cb25ec78ed6a6444264ffc`, and squash
`124ec51cefd022dd7103a4f958cb9ebef5427dad` matched. Request identity, two projections, exact-head
proof, and protected main were green.

`T117B-PORTAL` completed through promotion `#1665` and product `#1666`, using its
[gate](./2026-08-28-t117b-portal-design-gate.md), eleven-path
[admission](./2026-08-28-t117b-portal-admission.json), and allocation. Product head
`2ad7708bf5b694a392e7d41e13f7e98fb2fcc5a2`, tree
`368ca4056be5d14d8661b110518f5551c97b643b`, and squash
`d4edda418f991a4c8f4a35ef8e854d4a6efd3b33` matched. It supplies the unmounted DATA-backed
presentation; proof and main were green. CUTOVER's zero-sum ownership prerequisite completed in
PR `#1676`, with squash `64a5403f5d7f55891a353fe4d914a7ad2bab30bc` and tree
`e80746833fb974829035a83c99dbd95a50911c9f`; exact PR and protected-main health were green, and CD
was cancelled before deployment. Repairs through `#1686` established the 21-path map; its final
prerequisite squash is `01117c712f56ce0ce12750605b3fbf0b337d24c3`, tree
`7e44c5a177b8da0770b8e12a445037b62e9cfee4`.

`T117B-CUTOVER` completed through `#1691/#1675` with its exact 21-path
[admission](./2026-08-28-t117b-cutover-admission.json). Head `503d4b179251f9d3d06e07349ec80f85805565ae`,
tree `61b2316606c9b3facd6c8aff2a14bb4402d80c82`, and squash
`31cae997e42dbc0bee13ca670899b988576bd42c` matched. The member route mounts DATA-backed PORTAL
through one fail-closed request identity while preserving neutral-host drafts. Exact-head and main
checks were green; CD had no deployment effect. T-117C `#1724` failed on public no-JS;
`#1726/#1727` closed and admitted its repair. Historical build and 7/7 Z620 passed. #1731 admits 52 paths; #1733 admits the final corpus with main verified. #1734 merged; #1737 admits 53 paths, main CI/Sonar passed. Promotion #1738 and product #1736 merged; T117C implementation is delivered. Closeout records an inactive projection; successor promotion remains separate.

Closed `IDA-WF01-ONE-APPROVAL-DELIVERY` remains immutable evidence through its
[closeout](./2026-08-21-ida-wf01-one-approval-delivery-closeout.md),
[authority anchor](./current-authority-v1.json), artifacts, and receipts; it grants no Lean runtime.

T-115 OD17 is terminal. CI01/A1 and PR #1610 remain separate/unpromoted. Workflow Protocol v1
grants no product, auth, routing, tenancy, schema/RLS, billing, provider, E2E, AI, or Docker work.

## M0-M5 Implementation Blueprint

| Phase | Preserved frontier                                                                         |
| ----- | ------------------------------------------------------------------------------------------ |
| M0-M5 | Architecture-finalization program/tracker remain the blueprint; no M0-M5 node is promoted. |

## Ordered Candidate Priorities

| Priority | Candidate                          | Dependencies    | Promotion constraint           |
| -------: | ---------------------------------- | --------------- | ------------------------------ |
|        1 | Locale-aware currency parsing      | Promotion #1753 | Completed migration trial 1/3. |
|        2 | Bounded failed-run retry           | Owner direction | Completed migration trial 2/3. |
|        3 | Unsupported claim AI document type | Trial 2         | Completed migration trial 3/3. |

## Ordinary Product Delivery

The owner adopts the ordinary protected-PR workflow demonstrated by trials 2 and 3
for subsequent explicitly scoped work. This program selects priorities; the tracker
records status. Neither a green gate nor an inactive legacy resolver selects a new
feature or authorizes work outside the owner's scope.

- Use one bounded implementation PR with its tests and necessary status updates.
  No separate routine promotion/closeout PR, per-slice code exception, Brain
  publication, or model approval panel is required.
- `AGENTS.md` supplies repository boundaries; the Interdomestik skill guides
  research, implementation, helper ownership and verification. AI OS/Brain/Wiki
  remain advisory. Legacy slice runners and Lean authority are explicit-only;
  their inactive state is not a prohibition on ordinary authorized product work.
- Preserve tenant/auth/RLS, document lifecycle, data integrity, canonical routes,
  the read-only proxy boundary, required CI and protected expected-head merges.
  Focused tests support iteration; `pnpm pr:verify`, `pnpm security:guard` and
  required E2E evidence still govern delivery. Reuse proof only for matching inputs
  where existing contracts permit; do not run an already-covered heavy lane twice.
- Review according to risk, including substantive review bodies and inline
  comments. Consolidate corrections before the final expensive proof. A real
  security or product failure remains blocking; diagnose infrastructure failures
  before repeating unchanged runs.
- Z620 prospective receipts below establish the historical three-trial result;
  they are not a new recurring migration-qualification requirement. Follow the
  selected task's actual verification requirements and isolate its resources.
- Record prepared, tested, merged, deployed and user-validated states separately.
  Staging remains intentionally dormant; this work authorizes no deployment.
  CD subscribes only to version tags and manual dispatch, not `main` pushes.
  Restore the automatic staging trigger only on explicit owner
  reactivation of staging. Tag/manual releases retain their existing guards;
  they are not authorized by a maintenance merge. PR #1760 establishes this
  boundary before package-command PR #1759 merges. The trusted-parent classifier
  and runtime-sensitive `package.json` classification remain unchanged.

## T117C Product Delivery

Promotion #1738 bound owner review `5164184965` to head
`8b2cce527d6ec22114eb2fce3e8bad8a3528feb9`. Product #1736 merged verified head
`f13c81712d5fa012c6407337852217473a1c4d4d` as
`c3e79d91d103c373ac9014d136956e8d91815991` on 2026-09-10.
Its 50 changed paths fit the unchanged 53-path authorization. CI `34452735233`,
E2E and smoke `34452735175`, Pilot `34452735196`, finalizer `34452735368`, and
delivery `34452769704` attempt 2 passed. The unused request boundary and its test
were removed; #1729 was closed as superseded. Protected-main CI `34454527870` and Sonar `34454689720` passed at the exact merge. E2E reused PR evidence; coverage ran again and passed.

Product PR #1744 head
`b9128de3b787e26eb08935a4d85cc7580398d6cd` merged as
`be7f1d9f794f4faf338b11dfdfd43e43fe469076`, tree
`0528a173b2d29d2f5d09e4e066467f513607ca4e`. Existing protected-main evidence remained green and
was reused. A later exact clean detached merge rehearsal ran the resource-owned Z620 `e2e-pr` lane in
1,548,982 ms with exit code 0. Gate result SHA-256 is
`5d15d07e940511665631d8819ce72345c49ea1b5885e7372a269850270d2fc59`; redacted log SHA-256 is
`c5ab7f1ac1898f1b82b23d400b7ae8465b7143c0ee29fa9446e6a1a3285718d9`. The task database,
reserved port, processes, and 5.3 GiB temporary checkout were removed; Z620 returned to 96 GiB
free. The run establishes a successful technical baseline but earns no migration credit: live
activation and a repo-bound prospective protocol did not both precede product merge and measured
execution as required by this slice's admission. Migration therefore remains 0/3.

For the completed trials 2 and 3, the owner's explicit execution direction admitted one bounded ordinary product PR
per trial while Lean authority remains inactive. No separate promotion/closeout PR or hard-coded
per-slice policy exception is required. Each candidate must freeze its exact base SHA, product head,
merge-candidate tree and lockfile hash before the repo-native
`z620-resource-run.mjs --lanes=e2e-pr` execution. The clean detached run uses a task-owned database
and port; unchanged protected PR evidence may be reused, and the result, redacted log, hashes,
duration and cleanup state remain external evidence. A run started without that pre-execution
binding or with failed cleanup earns no credit. Both that evidence and the expected-head merge
passed for all three trials. Migration progress is 3/3; the ordinary workflow above now applies.

## Currency Parsing Trial 1 Promotion

Promotion #1753 admitted only `MIGRATION-CURRENCY-PARSING-TRIAL-1`. Product #1754 fixed exact head
`9547770dce4d21b0c9dd24e42d3e38c3a6d61095`, tree
`8825fbc3a039ad5253c49b873b6a1c6343ae27fb`, and merge candidate tree matched the immutable
pre-execution freeze. The Z620 `e2e-pr` lane passed in 1,456,046 ms; result SHA-256 is
`3075f62bd505efabea25d943465a214ece8910c4f222bdea4b0316fa29ec89af` and log SHA-256 is
`6248d80f016c83c520d986017516b20560acde74d42881affc35445fe3cb74a8`. The task database,
reserved port, and runner process were absent after execution; the private workspace returned
clean at the exact head/tree with 5.0 GiB free. GitHub Full E2E attempt 2, Pilot, CI, Sonar,
finalizer, and delivery passed on the unchanged head. Product #1754 then squash-merged as
`a6a634169020e73341932bd37001864b41563733` on 2026-09-11. Migration progress is now 1/3.

[Shared evidence](https://gist.github.com/arbenl/b1c4fbacb88b110d557baa0d401b6d81/53f1e39febca8bce97389993dfdfad4df4630351)
retains the freeze, receipt, gate result, and full Z620 log. The tracker points here for stable proof.

## Failed-run Retry Trial 2

The bounded candidate permits exactly one Inngest retry for a claim-document workflow after a
generic `claim_ai_processing_failed` result. Retry intent comes only from trusted attempt `1`; the
tenant-scoped compare-and-set binds both `status=failed` and that eligible error code before
returning the run to `processing`. Completed work, permanent extraction/deletion failures, later or
duplicate attempts, and a lost compare-and-set race remain skipped. The existing document/claim
tenant joins, RLS transaction boundary, routes, auth, schema and deployment surface remain
unchanged.

Product #1757 fixed head `4a6ebbed9bb8a942d707ad81cef57fcede02dd63`, tree and merge-candidate
tree `fb3ee8f53f290b82b43dbde16fc6cd6a8749f5bf`. The exact-head Z620 `e2e-pr` lane passed
in 1,551,834 ms; result SHA-256 is
`4ad149d001623f5ba63dfb8609e849704e4c26583695c5558e585177a52d0ad6` and log SHA-256 is
`cb44f5d3b3af05b391141a24f31419f35c1f23d444e02fc87aa254469a7516ea`. The task database,
reserved port, and runner process were absent after execution; the clean temporary candidate was
removed while its evidence was retained. All protected PR contexts passed on the unchanged head,
which squash-merged as `1728afd3c76f952de9a6df87502800965e041093` on 2026-09-11. Migration
progress at that checkpoint was 2/3.

## Unsupported Claim AI Document Type Trial 3

The bounded candidate preserves accepted claim image/audio uploads and human access to the source,
but the default AI workflow no longer records a completed metadata-only extraction when it cannot
read the uploaded format. Plain text and PDF decoding remain unchanged. Accepted image/audio MIME
types and unknown types fail permanently as `claim_ai_unsupported_document_type` before either
claim extractor or extraction persistence runs. The existing upload allowlist, consent, document
lifecycle, tenant-scoped failure persistence, retry policy, routes, auth, schema and deployment
surface remain unchanged. Product #1758 merged exact head
`0819504edd2124ce4606e6102d980d78c2279ec4` as
`d54fa720ba812ade5584ada9ab51aa02a9fc0c46` on 2026-09-11 at 16:36:22 UTC.
Head and merge tree matched `145260744f66eee7ecef50d24b1873d181fa71c3`.
The corrected prospective Z620 run passed in 1,553,241 ms with exit 0;
result SHA-256 `629850774c15c55c114d005a2e020c52c98916155c81a64808d5f7ef4bb84437`,
redacted log SHA-256 `f40d568e8c86ca2a56b2c8f50df3d984443695339b8c0bb4770264b6bbb6ab8e`.
The execution owner reported task database/port/process/candidate cleanup and
13/13 successful protected-main checks. No production deployment occurred.
Trial 3 is completed; the three-trial migration is 3/3.

## Staff Current-Claim Tenant Context Promotion

Promotion #1749 and product #1744 are closed; their later rehearsal is baseline evidence only.

## Unified Portal Direction

Use one responsive capability shell, never role copies. `Case → Actions → Timeline` is core; order
is `T-118 → T-117A → T-116 → T-117B → role/task views`. Member starts with Help
Now/Cases/Documents; other roles retain their tasks. Tenant/legal context appears only when useful;
benchmarks guide rationale, not trade dress. T-117B uses async RSC, sibling Suspense,
request-scoped identity, and two projections. `cacheComponents`, PPR, named routes, `next.config`,
and global headers remain T-117C.

## Selection Constraints

- Each implementation branch has one integration owner. Independent helpers use
  disjoint file ownership or isolated worktrees; reviewers remain read-only.
- Ordinary delivery follows the workflow above. Exact writer-map admission is
  required only when explicitly invoking a legacy governed slice, not as an
  additional promotion step for every ordinary PR.
- For the explicit legacy Lean workflow, invalid authority/proof fails closed with `runtime_authorized:false`, `activeSlice:null`, and
  successors blocked; a valid `promotion_pending` projection may name `activeSlice` while runtime
  remains false.
- Modularity follows `scripts/modularity-guard-policy.mjs`, not a universal
  150-line ceiling. No unrelated splitting or minification to satisfy prose.
- Models, Z620, cache data, and advisory memory can support evidence but cannot grant authority.
- The repository validator remains the authority for an explicitly invoked Lean
  slice. External skills and MCP state cannot grant or block that slice, and
  ordinary-PR adoption does not change its inactive projection.
- Existing unrelated worktrees, branches, PRs, artifacts, histories, and provider state are preserved.

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

## Historical Authority

Rev 243 history is recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json), SHA-256
`355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. Architecture-finalization,
OD17, and CI01 remain historical and inactive.

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator.
