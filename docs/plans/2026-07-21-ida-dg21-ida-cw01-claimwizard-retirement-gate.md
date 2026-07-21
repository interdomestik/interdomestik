# IDA-DG21 — ClaimWizard Retirement / Legacy Claim Contract Cleanup

## Identity and authority posture

- Gate ID: `IDA-DG21`
- Sole proposed implementation slice: `IDA-CW01`
- Gate state: `draft_external_non_promoted`
- Base commit: `9a3d3d1748a0f8e5ee6e66cb848fcb29b2d7758a`
- Current action: Tier 0 discovery/design review only
- Prospective implementation: Tier 3 because it changes shared Playwright/E2E/pilot contract surfaces
- Runtime authorized: `false`
- Deployment authorized: `false`
- Repository authority: `docs/plans/current-program.md` and `docs/plans/current-tracker.md`
- Advisory context: AI OS/Brain/Obsidian only; none can promote this gate

This packet proposes one consolidated retirement outcome. It authorizes nothing until
Arben accepts the exact final bytes/hash, the packet is promoted canonically, the
repository resolver selects only `IDA-CW01`, and a separate exact runtime authority is
accepted.

## Why this slice exists

`IDA-UI03a3` replaced `/member/claims/new` with the neutral-IDA Claim Draft Intake.
Submission is intentionally disabled and inert. The former ClaimWizard trees are now
production-orphaned, but their writer-capable implementations and several executable
unit/E2E/pilot contracts still describe real claim creation.

Leaving those files in place creates three risks:

1. accidental resurrection of the old `submitClaim` UI path;
2. reviewers and agents repeatedly treating stale wizard selectors as current product
   contracts;
3. full/pilot suites claiming coverage for a flow that the current route no longer
   exposes.

The outcome is retirement, not replacement claim submission. The current dormant draft
intake stays unchanged. The canonical claim action/domain writers remain available and
tested for a later, separately designed new-architecture submission slice.

## Read-only discovery evidence on the exact base

1. Production import scan found no production import of either ClaimWizard. The only
   direct ClaimWizard imports are their own three unit-test files. Three additional
   direct unit tests cover the three private wizard-step components that are deleted
   with the orphan tree, for six deleted unit-test files in total.
2. The active route test still mocks `@/components/claims/claim-wizard` only to prove it
   is not rendered; the route implementation already renders `ClaimDraftIntake`.
3. The deletion candidate contains 4,312 physical lines across 24 orphaned production,
   unit-test and legacy E2E files.
4. Playwright static listing selected 27 legacy test entries from exactly 8 legacy
   specs across `ks-sq`, `mk-mk`, and `pilot-mk`, plus 2 required setup entries from
   `setup.state.spec.ts` (29 listed tests in 9 files overall). All 8 legacy specs are
   items 19-24, 27 and 28 in the exact map. Those legacy specs still contain `wizard-next`,
   `claim-title-input`, `wizard-submit`, or `claim-created-success` positive-flow
   expectations.
5. `apps/web/src/actions/claims.core.ts`, `apps/web/src/actions/claims/submit.core.ts`,
   `packages/domain-claims/src/claims/submit.ts`, their validators, upload-intent
   boundaries and focused action/domain tests are not production-orphaned and are not
   deletion candidates.
6. The current Claim Draft Intake boundary already rejects ClaimWizard imports,
   `submitClaim`, and `createClaim` from the active route/component graph.
7. TypeScript module resolution on the exact base accounted separately for every one
   of the 12 production deletion candidates. All resolved static imports, re-exports,
   dynamic imports, requires and test mocks close over items 1-18 plus the mapped
   negative route-test mock in item 25; no surviving production importer exists. P00
   must reproduce this result as a per-path ledger rather than relying on a basename
   search.

## Sole outcome

Remove the two orphaned ClaimWizard implementations, their private component trees and
direct unit tests; remove executable legacy E2E/pilot specs whose purpose depends on the
retired wizard; update the remaining generic/onboarding contracts so they describe the
current dormant draft intake; and install durable static proof that the retired wizard
cannot re-enter production or ordinary E2E contracts accidentally.

No new claim-submission UI is created. No claim is created. No persistent state is
changed by implementation or acceptance proof.

## Exact implementation file map

### Delete — orphaned production UI (12)

1. `apps/web/src/components/claims/claim-wizard.tsx`
2. `apps/web/src/components/claims/claim-wizard/commercial-flow.ts`
3. `apps/web/src/components/claims/claim-wizard/handoff-summary.tsx`
4. `apps/web/src/components/claims/claim-wizard/step-content.tsx`
5. `apps/web/src/components/claims/claim-wizard/success-state.tsx`
6. `apps/web/src/components/claims/claim-wizard/types.ts`
7. `apps/web/src/components/claims/claim-wizard/validation.ts`
8. `apps/web/src/components/claims/claim-wizard/wizard-shell.tsx`
9. `apps/web/src/components/claims/wizard-step-category.tsx`
10. `apps/web/src/components/claims/wizard-step-details.tsx`
11. `apps/web/src/components/claims/wizard-step-evidence.tsx`
12. `apps/web/src/components/dashboard/claims/claim-wizard.tsx`

### Delete — direct unit tests and obsolete executable contracts (12)

13. `apps/web/src/components/claims/claim-wizard.test.tsx`
14. `apps/web/src/components/claims/claim-wizard.ui-v2.test.tsx`
15. `apps/web/src/components/claims/wizard-step-category.test.tsx`
16. `apps/web/src/components/claims/wizard-step-details.test.tsx`
17. `apps/web/src/components/claims/wizard-step-evidence.test.tsx`
18. `apps/web/src/components/dashboard/claims/claim-wizard.test.tsx`
19. `apps/web/e2e/staff-flow.spec.ts`
20. `apps/web/e2e/live/pilot-day1-drive.spec.ts`
21. `apps/web/e2e/pilot/c1-01-pilot-ceremony-closed-loop.spec.ts`
22. `apps/web/e2e/pilot/c1-04-pilot-staff-triage.spec.ts`
23. `apps/web/e2e/pilot/c1-05-pilot-staff-member-status-loop.spec.ts`
24. `apps/web/e2e/pilot/scenario-01-ks-e2e.spec.ts`

Git history and existing dated pilot evidence remain the historical record. Removing
these executable specs is not proof that their former behavior still works. A future
new-architecture claim-submission gate must create fresh closed-loop pilot contracts.
The remaining `c2-*` tenant/write-isolation pilot contracts stay intact.

### Modify — truthful current contracts and deterministic inventory (9)

25. `apps/web/src/app/[locale]/(app)/member/claims/new/page.test.tsx`
    - remove the obsolete virtual ClaimWizard mock;
    - retain route/session/membership/handoff/neutral-host/dormant-intake proof;
    - before mock removal, enumerate and mutation-check the retained route render,
      session guard, membership guard, dormant-intake render and disabled-submit
      assertions so green cannot be obtained by silently dropping their subjects.
26. `apps/web/src/actions/commercial-write-path-retirement.test.ts`
    - replace ClaimWizard-presence assertions with exact absence assertions;
    - retain proof that commercial callers use canonical `.core` actions and that
      `actions/claims.ts` does not re-export `submitClaim`.
27. `apps/web/e2e/ui-v2-onboarding.spec.ts`
    - preserve dashboard/CTA navigation;
    - assert the current draft intake, supported category and disabled/inert submit,
      never old wizard controls.
28. `apps/web/e2e/TEMPLATE.strict.spec.ts`
    - keep it skipped as a template;
    - update example selectors and assertions to the dormant draft contract so future
      authors do not copy the retired wizard;
    - include it in the static retired-selector scan, while claiming no execution
      coverage for this intentionally skipped template.
29. `apps/web/playwright.config.ts`
    - remove the retired `scenario-01-ks-e2e.spec.ts` pilot-match entry and any now-empty
      composition only; all other project semantics remain byte-identical.
30. `scripts/check-e2e-tenant-host-lanes.mjs`
    - remove checks tied only to the deleted live/C1/scenario files;
    - preserve every remaining host/tenant lane assertion.
31. `scripts/start-10x-task.sh`
    - remove the retired ClaimWizard context path only.
32. `scripts/ci/web-production-lint-warning-baseline.json`
    - remove only entries belonging to deleted ClaimWizard files.
33. `scripts/repo-size-budget.json`
    - regenerate deterministically to reflect the exact tracked-inventory deletion;
    - the diff may contain only arithmetic effects of mapped deletions/reductions, with
      no policy or unrelated threshold change.

No file outside this exact map may change. No new file is allocated.

## Consolidated remediation envelope

To avoid micro-addendum loops, the following is pre-authorized only after exact runtime
authority for this slice is accepted:

- test-first fixes to reviewer, Sonar, security, type, lint, Playwright-listing or
  required-gate defects directly attributable to the 33 mapped paths;
- deletion or reduction of additional stale lines inside those mapped paths when needed
  to make the single retirement outcome truthful;
- deterministic `scripts/repo-size-budget.json` synchronization caused solely by this
  exact deletion-heavy change;
- exact selector/name adjustments inside mapped tests when the merged IDA-UI03a3
  contract requires them.

The envelope does not allow a new path, new behavior, weakened assertion, new skip/fixme,
route/auth/tenant change, writer invocation, dependency change, workflow change, or
provider/database/deployment action. Any such need is a hard stop and requires a new
design disposition, not another micro-acceptance inside this slice.

## Product and UX invariants

- `/member/claims/new` continues to render the current IDA-UI03a3 Claim Draft Intake.
- Existing neutral-host, session, membership, access/default-tenant and locale behavior
  is unchanged.
- Vehicle/property draft preparation remains available exactly as merged.
- Injury/travel unsupported behavior remains unchanged.
- Secure Save/Manage, cross-session resume, CAS conflict and permanent delete behavior
  remain unchanged.
- `claim-draft-submit-disabled` remains visible, disabled and inert.
- No `claim-created-success` positive state is introduced.
- No new copy, layout, interaction or accessibility behavior is introduced.

Because no rendered product file on the active route is modified and the user-visible
baseline must remain unchanged, external operator benchmarking is not applicable to this
retirement gate. Browser regression against the merged IDA-UI03a3 baseline is mandatory.

## Writer/domain preservation boundary

The following are read-only audit surfaces and must not be edited or deleted:

- `apps/web/src/actions/claims.core.ts`
- `apps/web/src/actions/claims/submit.core.ts`
- `apps/web/src/actions/claims/create/**`
- `apps/web/src/actions/claims/submit/**`
- `apps/web/src/lib/validators/claims.ts`
- `apps/web/src/features/claims/upload/server/**`
- `apps/web/src/app/api/claims/**`
- `packages/domain-claims/**`
- schema, migrations, RLS, counters, events, audit, notifications and storage/provider
  implementations.

Their existing action/domain/security tests remain. This slice proves only that no
current UI or ordinary E2E contract invokes them through the retired ClaimWizard.

## Hard exclusions

- no modification of the current Claim Draft Intake production files or route entry;
- no replacement submission UI, no enabled submit, no ClaimWizard successor;
- no claim row, number, counter, event, audit row, document, notification or provider
  call;
- no direct database contact, fixture mutation or migration execution;
- no proxy, route, auth, session, shared-auth, host, tenancy, membership, billing,
  schema, RLS, ACL or role change;
- no dependency, lockfile, package manifest, GitHub workflow or CD change;
- no deployment, preview/staging/production alias or provider action;
- no AI runtime, prompt, model, eval, retrieval, Brain or memory behavior change;
- no resumption of `IDA-UI03a2`, P0/P0a/P0a2 or any other frozen architecture slice;
- no Authority Sync, CD/Staging stabilization, next UI/product slice or runtime AI work.

## Stop conditions

Stop before implementation or during remediation if evidence shows any of the following:

1. either ClaimWizard is imported by a production entrypoint on the exact base;
2. a deleted file owns a contract not preserved elsewhere and necessary for current
   IDA-UI03a3 runtime behavior;
3. truthful cleanup requires editing a writer/domain/protected surface;
4. a required test needs real claim creation, a database/provider call, or an enabled
   submit;
5. the current route or draft intake must change to pass;
6. a file outside the exact map is required;
7. origin/main moves before implementation and the new base changes the inventory;
8. a new attributable security/Sonar/reviewer finding cannot be fixed within the
   consolidated envelope without weakening the contract.

## Test-first and acceptance evidence

### P00 — read-only pre-edit proof

- exact clean base and resolver selecting only `IDA-CW01` after canonical promotion;
- a repository-wide TypeScript-resolved importer ledger, one row per path below, scans
  static imports,
  re-exports, dynamic imports, requires and test mocks and records every importer:

  | Deleted production path | Exact-base importer closure that P00 must reproduce |
  | --- | --- |
  | `apps/web/src/components/claims/claim-wizard.tsx` | deleted tests 13-14 and mapped negative route-test mock 25 only |
  | `apps/web/src/components/claims/claim-wizard/commercial-flow.ts` | deletion item 1 only |
  | `apps/web/src/components/claims/claim-wizard/handoff-summary.tsx` | deletion item 8 only |
  | `apps/web/src/components/claims/claim-wizard/step-content.tsx` | deletion item 8 only |
  | `apps/web/src/components/claims/claim-wizard/success-state.tsx` | deletion item 1 only |
  | `apps/web/src/components/claims/claim-wizard/types.ts` | deletion items 1, 3 and 8 only |
  | `apps/web/src/components/claims/claim-wizard/validation.ts` | deletion item 1 only |
  | `apps/web/src/components/claims/claim-wizard/wizard-shell.tsx` | deletion item 1 only |
  | `apps/web/src/components/claims/wizard-step-category.tsx` | deletion items 4, 13, 14 and 15 only |
  | `apps/web/src/components/claims/wizard-step-details.tsx` | deletion items 4, 13, 14 and 16 only |
  | `apps/web/src/components/claims/wizard-step-evidence.tsx` | deletion items 4, 13, 14 and 17 only |
  | `apps/web/src/components/dashboard/claims/claim-wizard.tsx` | deleted test 18 only |

  Item 26's source-text reads of items 1 and 12 are mapped negative-contract inputs,
  not runtime imports. Any importer outside the stated deletion/mapped-test closure,
  any ambiguous alias/same-stem resolution, or any surviving production importer is a
  hard stop before deletion.
- Playwright `--list` records the exact stale ordinary/pilot contracts;
- all Playwright config files are scanned against the exact six deleted spec basenames.
  On the exact base, the sole named hit must be
  `apps/web/playwright.config.ts` -> `pilot/scenario-01-ks-e2e.spec.ts`; the other five
  basenames must have zero named config hits. A hit outside mapped item 29, or any named
  entry that would dangle after deletion, is a hard stop.
- before deleting `c1-04`, `c1-05` or `scenario-01`, create an assertion-level
  contract-loss ledger. Every assertion/precondition must be classified either as
  dependent on the same-run newly submitted claim or as writer-independent and mapped
  to an exact surviving/mapped contract. The minimum preservation map is:

  | Deleted spec | Writer-independent behavior that must remain proven | Existing preserving contracts (read-only unless already mapped) | Submission-dependent gap that may be retired |
  | --- | --- | --- | --- |
  | `c1-04-pilot-staff-triage.spec.ts` | agent member provisioning and host isolation; seeded-claim staff queue/detail/assignment; cross-tenant staff write denial | `pilot/c1-03-pilot-member-provisioning.spec.ts`; `staff-claim-assignment.spec.ts`; `pilot/c2-04-cross-tenant-staff-member-write-isolation.spec.ts` | the newly submitted member claim's tenant/branch/member binding and its same-run appearance/assignment in staff triage |
  | `c1-05-pilot-staff-member-status-loop.spec.ts` | provisioning; seeded-claim assignment; status/action validation and lifecycle/history persistence; public member timeline/status reads | `pilot/c1-03-pilot-member-provisioning.spec.ts`; `staff-claim-assignment.spec.ts`; `apps/web/src/components/staff/claim-action-panel.test.tsx`; `packages/domain-claims/src/staff-claims/update-status.test.ts`; `packages/domain-claims/src/update-claim-status.test.ts`; `apps/web/src/app/[locale]/(app)/member/claims/[id]/_core.test.ts` | one same-run newly submitted claim flowing through staff status update and back to the creating member |
  | `scenario-01-ks-e2e.spec.ts` | dormant member entry; seeded-claim agent selection/messaging; staff assignment; admin operational card/state; cross-tenant claim denial | mapped `ui-v2-onboarding.spec.ts`; `gate/member-claim-draft-intake.spec.ts`; `gate/agent-workspace-claims-selection.spec.ts`; `staff-claim-assignment.spec.ts`; `admin-claims-v2.spec.ts`; `pilot/c2-02-cross-tenant-artifact-isolation.spec.ts` | creation/capture of a new claim ID and the single correlated member->agent->staff->admin chain built from that submission |

  The ledger must cite the exact preserving assertion, not merely a filename or a
  transitive gate. If any writer-independent assertion is absent, weaker, skipped or
  would require editing a path outside this exact map, stop and request one
  consolidated design disposition; do not delete the source spec.
- source/action/domain inventory proves writer preservation boundaries;
- zero DB/provider/deploy contact.

If P00 contradicts this packet, stop before product/test deletion.

### RED

- update `commercial-write-path-retirement.test.ts` first so it fails while orphaned
  ClaimWizard files still exist;
- update the UI_V2 onboarding assertion first so it fails on the old wizard expectation
  or until the dormant contract is asserted;
- for `page.test.tsx`, record the pre-edit assertion inventory and prove each retained
  route/session/membership/dormant-intake/disabled-submit subject is mutation-sensitive
  before removing only the obsolete virtual ClaimWizard mock.

### GREEN focused proof

- focused route/intake/boundary/commercial-retirement unit tests;
- focused `ui-v2-onboarding.spec.ts` on KS/SQ and MK/MK;
- Playwright `--list` proves none of the six deleted legacy E2E/pilot specs are selected;
- a repeat scan of every Playwright config proves zero named references to all six
  deleted spec basenames, including no residual `GATE_KS_PILOT_MATCH` entry;
- static scan finds no positive-flow `wizard-next`, `wizard-submit`,
  `claim-title-input`, `claim-created-success` or `claim-wizard-draft` outside the exact
  current negative/dormant allowlist;
- TypeScript, lint, E2E-contract, tenant-host-lane and repo-size checks pass;
- no claim writer import in the active draft graph.

### Final Tier 3 proof

- `pnpm slice:verify`
- `pnpm ci:local:pr`
- `pnpm ci:local:full` or exact resource-blocker classification after non-duplicated
  required evidence is green
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- Playwright MCP watched flow for `/member/claims/new` in SQ and EN, including keyboard,
  focus, disabled submit and no claim success
- current-head CI, Full E2E, Pilot Gate, Sonar, CodeQL, security, Codex/Copilot feedback,
  review threads and `pr-finalizer` green or honestly classified
- C1 closed-loop pilot contracts (`c1-01`, `c1-04`, `c1-05`) are intentionally retired;
  this accepted gap has no replacement in scope, and a future new-architecture
  submission gate is required before C1 closed-loop coverage can be claimed
- read-only before/after claim-side table counts/digests only if an already governed
  disposable fixture is used by mandatory gates; no new direct DB proof is authorized.

## Reviewer plan

Tier 3 bounded design review before promotion:

- Sonnet 4.6: architecture, accidental-resurrection, file-map and test-contract review;
- Gemini 3.1 Pro Preview: independent E2E/pilot/contract-loss review;
- Opus 4.8 only if a required route is blocked or reviewers disagree materially;
- Fable 5 skipped unless access is explicitly confirmed;
- no model verdict replaces repo evidence or Arben acceptance.

Implementation review must focus on:

- whether every deleted production module is truly orphaned;
- whether deletion silently removes current upload/action/domain protection;
- whether stale executable E2E/pilot tests remain;
- whether the current dormant intake can accidentally call a writer;
- whether the cleanup weakens tenant/auth/security or gate coverage;
- whether all reviewer remediation stayed inside the consolidated envelope.

## Operations, rollback and residual risk

This slice changes no deployed behavior and authorizes no deployment. Rollback is a
single PR revert restoring the deleted orphan UI/tests. Because the active route never
imports them, rollback is not required for ordinary product continuity.

Residual risk after successful retirement:

- real claim submission remains unavailable by design;
- no current closed-loop member→staff pilot claim is claimed;
- canonical action/domain writers remain dormant but present until the future
  new-architecture submission gate decides how they are used or retired;
- historical docs may still name deleted paths as dated evidence and must not be
  rewritten as if history changed.

## Completion definition

`IDA-CW01` is complete only when one implementation PR merges from the exact promoted
base, all mapped legacy UI/test contracts are removed or corrected, the current dormant
draft experience is unchanged, no writer/protected side effect occurs, current-head and
post-merge health are green/classified, canonical closeout records no active successor,
and no deployment occurs.
