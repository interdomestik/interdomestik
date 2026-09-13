---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-13
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Ordinary delivery follows the current program. Explicit legacy Lean runtime
> still requires matching canonical JSON and live Git/GitHub facts.

## Active Queue

No product slice is active. The canonical one-row queue/proof schema retains the completed
notification acknowledgement increment; T210 remains history and no successor is selected.
The current member screen is legacy integration evidence only. The planned net-new member UI/UX
belongs in the unified portal shell; canonical role routes and readiness markers do not authorize
separate dashboard designs or freeze the legacy presentation.

| ID                                  | Status      | Owner     | Work                                                                   | Exit Criteria                                    |
| ----------------------------------- | ----------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `T410-NOTIFICATION-ACK-CORRECTNESS` | `completed` | `product` | Make member notification read state reflect confirmed server outcomes. | PR #1765 merged; exact-main CI and Sonar passed. |

## Proof Ledger

| ID                                  | Source Refs                                    | Execution  | Run ID   | Run Root | Sonar | Docker | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------- | ---------- | -------- | -------- | ----- | ------ | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T410-NOTIFICATION-ACK-CORRECTNESS` | docs/plans/current-program.md; owner direction | `scripted` | abf37e7c | local/CI | pass  | pass   | `not_applicable` | `not_applicable` | final-source full proof and independent Astra review; protected PR #1765; matching merge tree; exact-main CI 34754164766 and Sonar 103716794800/34754164793 pass; one-slice Claude/Gemini waiver |

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
health verified. No product slice is active; this is not full T-410 completion and does not select T-411.

| Completed historical priority            | Status      | Constraint                                                                    |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Locale-aware currency parsing            | `completed` | Product #1754; migration trial 1/3 closed.                                    |
| Bounded failed-run retry                 | `completed` | Product #1757; migration trial 2/3 closed.                                    |
| Unsupported claim AI document type       | `completed` | Product #1758; migration trial 3/3 closed.                                    |
| Member timeline (T210)                   | `completed` | Product #1763; main CI and Sonar passed at the exact protected merge.         |
| Notification acknowledgement correctness | `completed` | Product #1765; exact-main CI/Sonar passed; no broader T-410 completion claim. |

No further successor row is recorded. A recommendation does not become program priority until the
owner selects it and the current program records that decision.

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
