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

| ID                               | Status        | Owner                    | Work                                                                                                                | Exit Criteria                                                                                                                                                                        |
| -------------------------------- | ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `S5-NEW-ACCOUNT-OTP-SECURE-SAVE` | `in_progress` | Codex / GPT-5.6 Sol high | Prove a new person can verify by real email OTP, securely save, return, resume and delete the exact eligible draft. | Native trusted-origin browser flow, loopback-only mail catcher, fail-closed negative paths, owner/tenant isolation, exact cleanup, focused/E2E proof, independent review and checks. |

### Current acceptance

- Base: current protected main `966a774028dc113757c298876e442e1ae80c73b5`; it includes protected
  PR #1814 and the bounded S6 lifecycle/access disclosure in protected PR #1815.
- Owned repository surface: the neutral OTP same-origin preflight, new-account OTP E2E proof,
  automated loopback email transport, PR-lane Mailpit service, exact evidence fingerprints and this
  canonical authority update.
- Preserve: native Better Auth Origin/CSRF validation, Supabase identity, proxy/routing and
  tenant/owner boundaries, exact draft facts, secret redaction and task-owned cleanup.
- Forbidden: Origin/header rewriting, auth bypass, external-provider fallback, proxy or schema
  changes, claim/membership/recovery side effects, production deployment and live-data mutation.

## Product Queue

Product implementation continues with one bounded S5 new-account OTP secure-save increment.
Completed bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                         |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Credit #1788/#1790/#1792/#1796/#1801 and #1814; PR #1803 new-account OTP secure-save proof is active; whole S5 remains open. |
| S6 — member continuation/membership         | `delivered_bounded`   | Credit protected #1815 for lifecycle/current-period/access disclosure; whole S6, offer, activation and renewal remain open.  |
| S7 — staff handling                         | `delivered_bounded`   | Credit assigned-staff acknowledgement in protected #1814; fulfilment and whole S7 remain open.                               |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                                  |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                    |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                                |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                         |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S5-NEW-ACCOUNT-OTP-SECURE-SAVE` | owner authorization; protected main through PR #1815; PR #1803 | `scripted` | `13d088a7f` | pending | pending | pass | not_applicable | pass | apps/web/e2e/gate/s5-new-account-otp-secure-save.spec.ts; apps/web/src/app/api/auth/[...all]/neutral-otp-boundary.test.ts; scripts/ci/main-e2e-reuse-cli.test.mjs |

## Current Facts

- Staging artifact `staging-verification-35784351048` from successful CD run #35784351048 proves the
  exercised P0.3/P0.4 staging boundary on exact SHA `c8f8834434a64962f042356721fa7657f7cc6253`.
  It is not production evidence, pilot admission or user acceptance.
- PR #1814 merged as `af191e71da589307a21df2a7fce14380a1fdd625`; exact-main CI,
  security, CodeQL and Sonar passed. Automatic CD run #35901050682 successfully built, deployed and
  verified staging; all production jobs were skipped.
- PR #1815 merged as `966a774028dc113757c298876e442e1ae80c73b5`; its bounded member
  lifecycle/current-period/access disclosure is delivered, while whole S6 remains open.
- S5 first-case saved-draft continuity completed through protected PR #1801. Whole S5 remains open.
- PR #1814 also completed the bounded request-linked member upload and assigned-staff
  acknowledgement predecessor. Request fulfilment, claim lifecycle and SLA behavior remain open.
- The owner selected the bounded new-account email-OTP secure-save proof as the active successor.
- Candidate `13d088a7f` passed the production-build Mailpit-backed canonical OTP journey (one pass,
  one intentional matrix skip), focused auth unit tests (10/10), exact-tree/workflow contracts
  (29/29), web type-check and independent high-risk re-review. Final `pr:verify`,
  `security:guard` and protected current-head evidence remain pending.
- `IDA-FST-004` local disclosure, provider confirmation (`IDA-MEM-006`), webhook/payment readiness
  and whole-process user acceptance remain outside it; no production billing incident conclusion is made.
- No deployment, product readiness or user-acceptance claim is made here; this bounded change does
  not authorize production release or claim whole-program readiness.

## Next Selection

`S5-NEW-ACCOUNT-OTP-SECURE-SAVE` is the selected successor and remains the only active product
slice. After protected delivery, the owner may select one bounded outcome from the current program.
Pending status prose alone does not create a new closeout PR or authorize unrelated product work.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
