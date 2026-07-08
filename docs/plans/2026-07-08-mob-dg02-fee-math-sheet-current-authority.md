---
plan_role: input
status: active
source_of_truth: false
owner: product-design + platform + qa
last_reviewed: 2026-07-08
tracker_path: docs/plans/current-tracker.md
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/2026-07-08-mob-05a-memo1-evidence-intake-current-authority.md
  - docs/product/2026-07-08-memo1-finance-cap-evidence-addendum.md
  - docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md
  - docs/product/2026-07-03-mobile-component-contracts-part-2.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/plans/2026-03-10-c02-success-fee-calculator-evidence.md
---

# MOB-DG02 Fee Math Sheet Current Authority

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself. It promotes exactly one implementation slice and does not implement
> runtime work, product UI, schema, RLS, migration, auth, session, tenancy,
> routing, proxy, billing, payment, claim writers, Agreement Ceremony writers,
> dependency, README, AGENTS, Brain tooling, generated wiki, or broad
> architecture work.

## Classification

Classified as promotion/design-gate work. It records a single governed runtime
slice selection after Memo 1 finance/court-path evidence was accepted for
`MOB-05a` preparation. It changes only authority docs.

Risk tier for this gate: Tier 0.

Risk tier for the later `MOB-05a` implementation worker: Tier 2 unless the
implementation discovers a protected-surface requirement. It must stop and
return to authority before touching proxy, auth, tenancy, routing, session,
schema, RLS, migrations, billing, payment, claim writers, Agreement Ceremony
writers, or live AI.

## Day-Of-Use Authority State

Prepared from `main@3d5d201d8590ec0d95625e35f2c2eb6970162505` on
2026-07-08.

The fresh current-authority resolver returned:

- `status=blocked_requires_current_authority`
- `reason=umbrella_without_concrete_promoted_slice`
- `activeSlice=null`
- `sourceFile=docs/plans/current-tracker.md`

That is the expected post-`MOB-01b` and post-Memo-1-evidence-intake state. No
replacement runtime slice was promoted before this gate.

## Inputs

- `docs/plans/2026-07-08-mob-05a-memo1-evidence-intake-current-authority.md`
- `docs/product/2026-07-08-memo1-finance-cap-evidence-addendum.md`
- `docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md`
- `docs/product/2026-07-03-mobile-component-contracts-part-2.md`
- `docs/product/2026-07-03-mobile-copy-system.md`
- `docs/product/2026-07-03-mob-execution-sequence.md`
- `docs/plans/2026-03-10-c02-success-fee-calculator-evidence.md`
- `docs/plans/enterprise-readiness-register.md`

Obsidian notes remain advisory only. Repository source, current-program,
current-tracker, tests, gates, and explicit user instructions remain
authoritative.

## Accepted Evidence

| Evidence                                  | Status for this gate                                                                                                                          | Reference                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed Memo 1 finance/court-path addendum | Accepted for `MOB-05a` preparation and used as the copy/cost authority for this gate.                                                         | Reviewer portal `ENT-A02-A03` / `MEMO1-FINANCE`, latest correction `corrections/2026-07-08T12-08-32-309Z-ent-a02-a03-gazmend/review.json`; attachment `Memo1_Court_Path_Cost_Addendum_Gazmend_Signature.pdf`, `application/pdf`, size `1480112`; repo-safe summary in `docs/product/2026-07-08-memo1-finance-cap-evidence-addendum.md`. |
| Memo 1 evidence-intake authority          | Accepted as the preparation closeout that allows this gate to be drafted.                                                                     | `docs/plans/2026-07-08-mob-05a-memo1-evidence-intake-current-authority.md`                                                                                                                                                                                                                                                              |
| Fee Math component contract               | Accepted as design input for the future implementation worker.                                                                                | `docs/product/2026-07-03-mobile-component-contracts-part-2.md`                                                                                                                                                                                                                                                                          |
| Mobile copy system                        | Accepted as copy-key and legal-review workflow input.                                                                                         | `docs/product/2026-07-03-mobile-copy-system.md`                                                                                                                                                                                                                                                                                         |
| C02 calculator evidence                   | Accepted as arithmetic lineage. Future `MOB-05a` must delegate fee arithmetic to existing calculator logic and not create new fee arithmetic. | `docs/plans/2026-03-10-c02-success-fee-calculator-evidence.md`                                                                                                                                                                                                                                                                          |

## Decision

Promoted slice: MOB-05a Fee Math Sheet display layer.

Promote exactly one canonical tracker slice: `MOB-05a`.

The next active governed implementation goal is exactly one canonical tracker
slice: `MOB-05a`.

No other `MOB-*`, Help Now, billing, payment, claim-writer, Agreement Ceremony,
CRM, VONESA, DOM, OMG, live AI, country exposure, or broad UI package slice is
promoted by this gate.

## Scope

Future `MOB-05a` is limited to the smallest Fee Math Sheet display layer:

- render the `FeeMathSheet` display component or repo-local equivalent;
- present recovered amount examples, success-fee amount, member discount where
  already supported by the C02 calculator lineage, and the user net amount;
- display entity/governing-law disclosure already required by the design
  contract, using existing available lineage only;
- use the allowed `fees.*` copy keys listed below;
- show the qualified / hybrid court-path cost wording from the signed Memo 1
  addendum;
- represent third-party and court-path cost treatment as display/copy only;
- emit only the no-PII view instrumentation authorized below;
- preserve public/offline display constraints for fee transparency;
- add focused unit/copy/accessibility/display proof for the changed display
  surface.

## Explicit Exclusions

`MOB-05a` must not authorize:

- billing, payment, Paddle changes, invoices, refunds, subscriptions, or success
  fee collection writes;
- claim writers, claim status transitions, recovery transitions, document
  writers, service authorization, or any member/case mutation;
- Agreement Ceremony writer, signature capture, POA, cession, approval action,
  or legal document generation;
- proxy, auth, tenancy, session, routing, canonical route, or protected-route
  changes;
- schema, RLS, migrations, database policy, data backfill, or seed changes;
- CRM, DOM, OMG, VONESA/flight runtime, KS/AL exposure, paid launch, or broad
  Help Now runtime continuation;
- live AI, Operational Brain runtime, model calls, prompts, retrieval,
  embeddings, vector search, or eval schema changes;
- generated Wiki, README, AGENTS, dependency changes, or broad UI package work.

## Copy Model

The future implementation must use the qualified / hybrid court-path model from
the signed Memo 1 addendum. The controlling source is
`docs/product/2026-07-08-memo1-finance-cap-evidence-addendum.md`.

Allowed meaning:

- no success fee to Interdomestik if there is no recovery;
- no public promise that every external court-path cost is always zero for the
  client;
- fixed court-path costs, court-decision fees, and agreed super-expertise costs
  are governed by a written court-path agreement before the cost is created;
- if Interdomestik pays court-expertise costs upfront and a court decision later
  awards reimbursement for those costs, that reimbursement returns to
  Interdomestik.

The future worker must not invent new fee or court-cost wording. If localized
copy cannot be derived from the signed addendum and reviewed `fees.*` inventory,
the implementation must stop and return to current authority.

## Allowed `fees.*` Keys

Only these `fees.*` keys are approved for the first `MOB-05a` implementation:

| Key                    | Surface                                                                                              | Authorized direction                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `fees.lossPromise`     | `FeeMathSheet`                                                                                       | If there is no recovery, there is no success fee to Interdomestik; external court-path costs are governed by the written agreement. |
| `fees.courtPathCosts`  | `FeeMathSheet`, later reused by Agreement Ceremony only after a separate writer gate                 | Court-path costs must be disclosed in writing before the case enters court.                                                         |
| `fees.thirdPartyCosts` | `FeeMathSheet`, later reused by `ProposalCard` only after its separate gate                          | Fixed court fees, decision fees, and super-expertise costs may remain the client's responsibility if agreed in writing.             |
| `fees.reimbursement`   | `FeeMathSheet`, later reused by Agreement Ceremony or `ProposalCard` only after their separate gates | Reimbursement for costs Interdomestik paid upfront returns to Interdomestik when awarded by court decision.                         |

No other `fees.*` key is authorized by this gate. New or changed `fees.*` keys
must carry L5-lineage review evidence in the implementation PR. If the future
worker needs extra keys, it must stop and return to current authority.

## Third-Party / Court-Cost Treatment

The display contract may use:

```ts
thirdPartyCostTreatment: {
  mode: 'written_agreement_required';
  reviewedCopyKeys: [
    'fees.lossPromise',
    'fees.courtPathCosts',
    'fees.thirdPartyCosts',
    'fees.reimbursement',
  ];
}
```

This is display/copy only. It must not create, approve, store, charge, collect,
or mutate any cost. It must not imply that the client owes a cost unless the
copy also says the cost is controlled by written agreement before the court
path begins.

Implementation must preserve the existing contract's earlier modes only where
already present in design input, but `MOB-05a` court-path copy must not hard-code
`absorbed_on_loss`, `member_payable_on_loss`, or `covered_until_cap` without a
reviewed mapping back to this signed addendum.

## Instrumentation

Authorize only no-PII display instrumentation:

- event name: `fee_sheet_viewed`
- optional action variant: `expanded` if the existing analytics convention uses
  the `fee_sheet_viewed` / `expanded` pair
- allowed fields: `context`, `source_surface`, `locale`,
  `third_party_cost_mode`, `offline_available`
- forbidden fields: user ID, account ID, claim ID, document ID, payment ID,
  precise location, free text, health or injury facts, uploaded-document
  content, recovered amount, fee amount, net amount, insurer name, staff name,
  or any billing/payment state

No claim writer, payment/billing event, outbox event, notification event, or
analytics expansion outside this display view event is authorized.

## Offline / Public Behavior

Fee transparency must not be paywalled. If the implementation uses a public or
offline display surface, it must:

- render from static/reviewed copy and deterministic calculator inputs only;
- avoid account, claim, document, payment, and session-dependent data;
- degrade to static examples when interactivity is unavailable;
- avoid auth, proxy, route, or service-worker architecture changes;
- not cache member, claim, payment, health, injury, or document data;
- keep unsupported-country, dark-pack, and public Help Now behavior unchanged.

If the display requires protected member/case data, that is outside this gate
and must return to current authority.

## Required Future Evidence

The `MOB-05a` implementation closeout must record:

- exact files touched and proof that no forbidden runtime surface was changed;
- unit/copy tests proving fee math delegates to existing C02 calculator lineage
  and does not duplicate fee arithmetic;
- copy tests or review evidence for the allowed `fees.*` keys and blocked
  unqualified zero-external-cost wording;
- accessibility proof for the Fee Math Sheet display, including keyboard/focus
  behavior and readable money/cost labels;
- Playwright or equivalent display proof for the surfaced Fee Math Sheet where
  applicable;
- no-PII instrumentation assertion for `fee_sheet_viewed`;
- public/offline behavior assertion if the surface is public/offline reachable;
- `git diff --check`;
- `pnpm docs:verify`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- focused implementation tests selected by the future worker's touched files;
- Phase C final gates required for implementation work unless explicitly
  narrowed by current repo policy at implementation time.

## Stop Conditions

Stop and return to current authority if any of these occur:

- `next-slice` does not resolve exactly `MOB-05a`;
- a second slice is needed to make the display useful;
- implementation needs billing, payment, claim writers, Agreement Ceremony
  writers, schema/RLS/migrations, proxy/auth/session/tenancy/routing, or service
  worker architecture changes;
- localized `fees.*` copy cannot be traced to the signed Memo 1 addendum and L5
  review lineage;
- the design needs unqualified "recover nothing, pay nothing" wording for
  court-path external costs;
- fee display disagrees with existing C02 calculator lineage;
- instrumentation requires PII, claim identifiers, payment identifiers, money
  amounts, free text, health/injury facts, or uploaded-document content;
- public/offline behavior would cache or expose member/case/payment data.

## Gate Proof

Tier 0 proof required for this gate:

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`
- `mcp__interdomestik_qa.scope_audit`

After this gate text and the matching program/tracker rows are applied,
`next-slice.mjs` is expected to return `status=ready` and
`activeSlice.id=MOB-05a`.

## Current Authority Outcome

After this gate merges, resolver state is expected to promote `MOB-05a` as the
only active governed implementation slice. Direct implementation must start
from a clean branch after that merge and must keep runtime scope within the Fee
Math Sheet display-layer envelope above.
