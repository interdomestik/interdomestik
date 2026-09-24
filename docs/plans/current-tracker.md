---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-24
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> This is the single active tracker. Historical proof is linked, not repeated.

## Active Queue

| ID                          | Status        | Owner                      | Work                                                                                                                 | Exit Criteria                                                                                                                                                                      |
| --------------------------- | ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S5-LOCAL-DRAFT-DISCLOSURE` | `in_progress` | Codex / GPT-5.6 Sol medium | Disclose device-local persistence before a new eligible organizer draft is written and keep a truthful no-save path. | Mounted EN/SQ/MK/SR coverage; shared-device, eligible/excluded-data, expiry/deletion and secure-save copy; opt-in/no-save proof; preserved recovery conflicts and no side effects. |

### Current acceptance

- Base: current protected main `6fbf6a5537613baac12d84b035d3ce8734a9010c`; it includes credited
  protected PRs #1801, #1803, #1814, #1815 and the closed #1816 delivery diagnostic.
- Owned repository surface: neutral-organizer disclosure component and wiring, anonymous local
  recovery write gate, EN/SQ/MK/SR catalogs and their structured owner, mounted/unit/E2E contracts,
  the exact E2E-reuse corpus fingerprint and these authority records.
- Preserve: OTP and secure-save flows, draft conversion/upload/acknowledgement, expiry, discard,
  stale-tab/conflict behavior, owner/tenant isolation, review-before-handoff and exact cleanup.
- Forbidden: proxy, route, auth, tenant, schema or billing changes; injury/document persistence;
  implicit local opt-in; claim/case/membership/payment side effects; production deployment.

## Product Queue

Product implementation continues with one bounded S5 local-draft disclosure increment.
Completed bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                        |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Deliver `IDA-FST-004`; credit #1788/#1790/#1792/#1796/#1801/#1803/#1814 and closed diagnostic #1816; whole S5 remains open. |
| S6 — member continuation/membership         | `delivered_bounded`   | Credit protected #1815 for lifecycle/current-period/access disclosure; whole S6, offer, activation and renewal remain open. |
| S7 — staff handling                         | `delivered_bounded`   | Credit assigned-staff acknowledgement in protected #1814; fulfilment and whole S7 remain open.                              |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                                 |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                   |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                               |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                        |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S5-LOCAL-DRAFT-DISCLOSURE` | owner authorization; SRS `IDA-FST-004`; protected main through PR #1816 | `scripted` | pending | focused pass; final pending | pending | pass | not_applicable | pending | apps/web/src/app/[locale]/components/home/free-start-intake-shell/browser-recovery-disclosure.test.tsx; apps/web/src/messages/free-start-premium-contract.test.ts; apps/web/e2e/gate/premium-free-start-recovery.spec.ts; scripts/ci/main-e2e-new-account-otp-reuse.test.mjs; scripts/modularity-guard-free-start-catalogs.test.mjs |

## Current Facts

- Staging artifact `staging-verification-35784351048` from successful CD run #35784351048 proves the
  exercised P0.3/P0.4 staging boundary on exact SHA `c8f8834434a64962f042356721fa7657f7cc6253`.
  It is not production evidence, pilot admission or user acceptance.
- PR #1816 merged as `6fbf6a5537613baac12d84b035d3ce8734a9010c`. Authorized manual
  diagnostic run #36003798077 verified PR #1803's exact immutable-preview SHA and reported
  `panel-visible`; it made no role mutation or staging retry. Automatic exact-main CD run
  #36003653726 passed staging P0.3/P0.4 and skipped production. These facts close the diagnostic but
  do not establish a role-panel root cause, production delivery, pilot admission or user acceptance.
- Retired diagnostic target `https://interdomestik-16cnb0jg6-ecohub.vercel.app` on SHA
  `f22127f2ebcf45b5dc64ea521dbeb298b77654be` was inspected read-only after failed CD run
  #35745073999 and later returned `panel-visible` without a redeploy or code change. It is superseded
  by the exact PR #1803 target and remains diagnostic context, not staging-delivery evidence.
- PR #1814 merged as `af191e71da589307a21df2a7fce14380a1fdd625`; exact-main CI,
  security, CodeQL and Sonar passed. Automatic CD run #35901050682 successfully built, deployed and
  verified staging; all production jobs were skipped.
- PR #1815 merged as `966a774028dc113757c298876e442e1ae80c73b5`; its bounded member
  lifecycle/current-period/access disclosure is delivered, while whole S6 remains open.
- S5 first-case saved-draft continuity completed through protected PR #1801. Whole S5 remains open.
- PR #1814 also completed the bounded request-linked member upload and assigned-staff
  acknowledgement predecessor. Request fulfilment, claim lifecycle and SLA behavior remain open.
- The owner selected `IDA-FST-004` local disclosure as the active successor. Focused component,
  recovery, shell and four-locale contracts pass 119 tests; web type-check and the mounted
  four-locale browser/no-save/opt-in proof pass. Final integrated verification and protected
  current-head evidence remain pending.
- Provider confirmation (`IDA-MEM-006`), webhook/payment readiness and whole-process user
  acceptance remain outside this slice; no production billing incident conclusion is made.
- No deployment, product readiness or user-acceptance claim is made here; this bounded change does
  not authorize production release or claim whole-program readiness.

## Next Selection

`S5-LOCAL-DRAFT-DISCLOSURE` is the selected successor and remains the only active product slice.
After protected delivery, the owner may select one bounded outcome from the current program.
Pending status prose alone does not create a new closeout PR or authorize unrelated product work.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
