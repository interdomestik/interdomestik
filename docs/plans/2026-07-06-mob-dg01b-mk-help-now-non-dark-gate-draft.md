---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/plans/current-program.md
  - docs/plans/2026-07-05-rbac-01-closeout.md
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/product/2026-07-05-mk-help-now-signature-package/README.md
  - docs/manual/runbook-content-pack-hotfix.md
  - docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-05.md
---

# MOB-DG01B Draft - MK Help Now Non-Dark Enablement

> Status: draft gate packet only. This document is not current authority, not a
> design-gate approval, not a launch approval, and not runtime implementation
> permission. It prepares the evidence shape for a later current-authority and
> design-gate decision.

## Purpose

Prepare the future `MOB-DG01B` decision for the smallest useful runtime action:
turning the already-merged `MOB-01` Help Now dark-pack mechanism into non-dark
MK Help Now exposure after MK content, hotfix, and alert evidence are complete.

The target runtime slice, if later promoted, is `MOB-01b`.

## Current Authority State

`docs/plans/current-program.md` Rev 91 says:

- `RBAC-01` is closed by `docs/plans/2026-07-05-rbac-01-closeout.md`.
- PR `#1299` fixed the narrow staging RBAC role-marker residual path without
  touching `apps/web/src/proxy.ts`.
- PR `#1300` recorded two same-day green `e2e-staging` jobs after one
  post-deploy P0.1 staff marker miss.
- Any future current-main staging P0.1 agent/staff marker miss freezes
  `MOB-01b` and returns to current authority.
- No replacement implementation slice is promoted.
- `MOB-01b` remains blocked on L2 country-content sign-off, B6 hotfix-runbook
  proof, B7 alert coverage, and a later current-authority/design-gate.

The resolver currently reports `blocked_requires_current_authority` with
`activeSlice=null`. That is the expected state until a fresh current-authority
record promotes exactly one concrete runtime slice.

## Proposed Future Gate Identity

| Field                                    | Value                                       |
| ---------------------------------------- | ------------------------------------------- |
| Proposed gate id                         | `MOB-DG01B`                                 |
| Proposed runtime slice                   | `MOB-01b`                                   |
| Country                                  | North Macedonia / Makedonia (`MK`)          |
| Surface                                  | Public Help Now / Trip Mode country content |
| Exposure target                          | Non-dark MK content only                    |
| Authority required before implementation | Fresh current-program and tracker revision  |
| Runtime status now                       | Blocked                                     |

## Scope If Later Promoted

The future slice may authorize only the smallest non-dark MK enablement:

- expose the signed MK Help Now content pack through the mechanism already
  shipped by `MOB-01`;
- verify the public Help Now route for supported locales;
- verify unsigned countries remain dark or blocked;
- verify service-worker and cache behavior for public content;
- verify anonymous public funnel evidence without PII; and
- link the runtime PR to the signed pack, B6 exercise, B7 alert proof, and
  current-authority record.

## Non-Goals

`MOB-DG01B` must not authorize:

- Help Now exposure for Kosovo (`KS`) or Albania (`AL`);
- VONESA, CRM, DOM, OMG, or member portal expansion;
- member account creation, claim writers, case companion, or payment flows;
- fee math, Paddle billing, subscriptions, refund logic, or invoices;
- schema, migration, RLS, auth, session, tenancy, proxy, or routing changes;
- `apps/web/src/proxy.ts` changes;
- Operational Brain runtime or live AI behavior;
- broad UI package implementation; or
- production paid launch.

## Entry Criteria

| Entry item                         | Required evidence before gate can pass                                                                                                                                                                                                | Current disposition                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENT-A01 / RBAC caveat              | `docs/plans/2026-07-05-rbac-01-closeout.md`, PR `#1299`, PR `#1300`, staging jobs `85224725930` and `85225352625`; no newer current-main P0.1 agent/staff marker miss.                                                                | Closed, caveated. Reopen if the marker miss returns.                                                                                                                                        |
| ENT-A04 / MK L2 sign-off           | Completed MK signature package with named reviewer, qualification, dated sources, completed sign-off matrix, pack version/hash, and final `GO` certificate.                                                                           | Pending. Package exists; signed evidence not yet recorded.                                                                                                                                  |
| ENT-A05 / B6 hotfix runbook        | `docs/manual/runbook-content-pack-hotfix.md` plus a dated staging exercise record proving re-darken, patch, manifest/hash update, public route proof, SW/cache revalidation, rollback/re-darken, timings, and release-owner sign-off. | Pending. Runbook exists; staging exercise missing.                                                                                                                                          |
| ENT-A06 / B7 alert coverage        | `docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-05.md` plus provider rule/monitor inventory, owner mapping, staging-safe synthetic signal, routed alert receipt, acknowledgement, and no-secret/no-PII proof.  | Pending. Contract exists; provider and synthetic proof missing.                                                                                                                             |
| ENT-A14 / placeholder trust review | Dated review that dark/placeholder country states read as "coming to your country" rather than broken, unsupported, or launched.                                                                                                      | Required before public exposure, but not a hard prerequisite for finalizing this gate draft unless current authority upgrades it. Not yet proven in repo evidence inspected for this draft. |
| Current authority                  | Merged current-program and current-tracker revision selecting exactly `MOB-01b` with `MOB-DG01B` as the design gate.                                                                                                                  | Missing. Resolver remains `activeSlice=null`.                                                                                                                                               |

## Proof Plan For Future Runtime PR

If and only if current authority later promotes `MOB-01b`, the implementation PR
must prove:

1. The deployed MK pack hash equals the hash recorded in the signed MK package.
2. Public Help Now renders non-dark MK content on staging for supported locales.
3. Unsupported or unsigned countries remain dark or blocked.
4. Service-worker revalidation shows stale public content does not persist after
   a manifest/hash bump.
5. No member, session, claim, document, payment, or private contact data enters
   public cache, logs, analytics, or alert records.
6. Anonymous Help Now funnel events contain only approved low-cardinality fields.
7. B7 alerts can observe or route failures for public route, pack manifest,
   service-worker/cache, cache guard, funnel pipeline, and dark-state drift.
8. The PR touches no forbidden protected surfaces, especially
   `apps/web/src/proxy.ts`.

## Stop Conditions

Stop the future gate or runtime PR immediately if any of these occur:

- wrong, uncited, or disputed emergency number;
- missing reviewer identity, qualification, date, source, signature, or pack
  hash in the MK package;
- deployed pack hash differs from the signed hash;
- staging shows stale Help Now content after manifest/hash update;
- unsigned country leaves dark state;
- B6 staging exercise fails or is not executed;
- B7 synthetic alert fails, is not acknowledged, or leaks private destination
  details;
- public events or cache include PII, session data, claim data, document data, or
  payment data;
- current-main staging produces another P0.1 agent/staff marker miss; or
- the proposed implementation requires proxy, auth, tenancy, schema, RLS,
  billing, or routing changes.

## Future Verification Floor

For a later runtime PR, mandatory Phase C gates remain:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Additional slice proof should include focused Playwright evidence for public
Help Now MK exposure, dark-state control countries, service-worker/cache
revalidation, and alert/funnel safety. Those checks prove only the slice; they
do not replace the final Phase C gates.

## Current Disposition

| Question                                                             | Answer as of 2026-07-06                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Can this draft be used to prepare reviewers and evidence collection? | Yes.                                                                                                         |
| Can this draft promote `MOB-01b`?                                    | No.                                                                                                          |
| Can runtime work start from this draft?                              | No.                                                                                                          |
| What blocks the gate today?                                          | ENT-A04 signed MK evidence, ENT-A05 exercise proof, ENT-A06 alert proof, and fresh current authority.        |
| What is the next repo-safe action?                                   | Complete the pending evidence rows, then run a current-authority/design-gate decision for exactly `MOB-01b`. |
