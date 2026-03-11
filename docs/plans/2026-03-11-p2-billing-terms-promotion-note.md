---
title: P2 Billing And Terms Hardening Promotion Note
date: 2026-03-11
status: completed
owner: platform
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# P2 Billing And Terms Hardening Promotion Note

## Decision

`P1T` is complete in `docs/plans/current-program.md`, and no post-`P1T` tranche had yet been committed in the live source-of-truth pair. The next committed tranche is now `P2` Billing And Terms Hardening with the full queue `B01` through `B10`.

## Inputs Considered

- `docs/plans/2026-03-07-gpt-5-4-phase-1-implementation-plan.md`: background AI runway already absorbed through completed `AI01` to `AI06`; no narrower post-`P1T` tranche to promote.
- `docs/plans/2026-03-06-v0-1-0-production-background-plan.md`: confirms the release slice should stay narrow, deterministic, and avoid routing, auth, tenancy, broad RLS, or broad extraction campaigns.
- `docs/MATURITY_ASSESSMENT_2026.md`: historical risk inventory; the high-ROI failure-surface items it named are already reflected by completed `D01` to `D08`.
- `docs/EXECUTIVE_MATURITY_ASSESSMENT.md`: historical maturity input; remaining ideas are either already completed, broader than the current failure surface, or explicitly later-stage.
- `docs/plans/2026-02-22-v1-bulletproof-tracker.md`: superseded historical tracker; useful for audit history only, not live sequencing.
- `docs/plans/2026-03-03-program-charter-canonical.md`: superseded charter; preserved as context, not a live post-`P1T` sequencing source.
- `docs/plans/2026-03-03-advisory-foundation-addendum.md`: active constraint on the old advisory tranche; not a live commercial sequencing mechanism after the rebaseline.
- `docs/plans/2026-03-05-pg3-advisory-evidence-refresh.md`: closes `PG3` historically and points to removed `PG4`; no live post-`P1T` tranche recommendation.
- `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md`: defines the commercial model and the required enforcement surfaces after the now-complete `P1C` and `P1T` publication work.
- `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md`: provides the only concrete post-`P1T` tranche sequence, establishes `P2` as the next tranche after `P1T`, and explicitly preserves the existing `B01` through `B06` billing queue.

## Existing `B01` Through `B06`

After the tranche shape was corrected to keep the existing billing queue, the concrete `B01` through `B06` definitions were recovered from the historical Phase 2 Billing Hardening snapshot in repo history. They remain narrow in-place hardening work, not a domain-extraction campaign:

- `B01`: remove remaining Stripe references
- `B02`: add idempotency keys to Paddle webhook handlers
- `B03`: add replay and double-provisioning integration tests
- `B04`: harden dunning with grace, retry, and downgrade lock
- `B05`: add entity-bound webhook signature verification per tenant
- `B06`: add invoice and subscription audit log entries

## Why `P2` Was Promoted Now

- `P1C` published the commercial contract and `P1T` shipped the Free Start and trust surfaces, so the next failure surface is split across two places: the existing billing and webhook safety surface plus contract drift between what the product now promises and what the product actually enforces.
- The blueprint names `Escalation Agreement` and membership billing or cancellation enforcement as required product-enforcement surfaces.
- `B01` through `B06` remain narrow because they harden the existing Paddle and billing surface in place, and `B07` through `B10` extend that same tranche to the newly published commercial contract.
- `B07` creates a durable commercial-term and payment-authorization state before staff-led recovery begins.
- `B08` makes cancellation, refund, and cooling-off behavior match the already-published annual-membership contract.
- `B09` and `B10` complete the same commercial path by defining collection fallback and durable auditability for accepted recovery matters.

## Why Other Candidates Were Not Promoted

- `P3` was not promoted because typed Server Action migration, idempotency, and route isolation are broader mutation-shape work than the current failure surface requires.
- `P4` was not promoted because matter ledger, SLA-state, and acceptance-control work depend on the contract, collection, and audit primitives established inside `P2`.
- `P4G` was not promoted because group access is pilot-expansion scope, not a current `v0.1.0` failure-surface reducer.
- `P5` was not promoted because design-system work is explicitly conditional and does not materially reduce the current launch failure surface.
- `P6` was not promoted because RC validation should follow, not precede, enforcement of the newly published commercial terms.
- The maturity, charter, advisory, and AI inputs were not promoted because their relevant narrow slices are already complete or they recommend broader background work that the live program now treats as input only.

## Risks This Queue Is Meant To Reduce

- remaining Stripe residue or config drift on the live billing surface
- replayed Paddle events causing double provisioning or unsafe billing side effects
- weak dunning or tenant-signature handling on the existing billing path
- missing invoice or subscription auditability during dispute or replay review
- staff-led recovery starting without signed escalation terms, fee terms, or payment authorization
- annual billing, cancellation, refund, or cooling-off behavior drifting away from the published promise
- accepted recovery matters losing durable commercial-term state needed for later enforcement and audit
- success-fee collection lacking a deterministic deduction, charge, and invoice fallback order
