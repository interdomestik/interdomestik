---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-04
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/2026-07-03-mob-execution-sequence.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-mobile-design-review-enterprise.md
---

# Fable Enterprise Red-Team Audit

> Status: **Fable 5 advisory audit only - no execution authority.** Findings are
> input for future product/design/legal cleanup. This document promotes no slice
> and authorizes no runtime, tracker, routing, auth, session, tenancy, proxy,
> schema, billing, VONESA, SVC, or CQRS work.

## Scope

Fable reviewed the merged pre-gate mobile/product package at a package level,
with emphasis on enterprise credibility, legal seriousness, claims operations,
artifact consistency, and governance drift. Findings below are condensed and
must be checked against live tracker/current-authority state before any edit.

## Priority Findings

### F1 - Fee Promise Is Ahead Of The Expert-Cost Decision

The package repeats "recover nothing -> pay nothing" as a structural promise,
while the expert-cost-on-loss decision remains a blocker for money surfaces.
Future MOB-05a/MOB-05b gates should treat the promise line as conditional until
the business/legal memo is decided and L5-reviewed.

Class: business/legal input. Maps to future money-surface gates.

### F2 - "Zero Server-Side PII" Is Too Absolute With Instrumentation

MOB-01's safety posture is sound, but "zero server-side PII" can over-claim if
anonymous funnel events use IP/device/browser signals. Safer wording: "no
identity data, no case content, and no account data server-side before explicit
handoff; instrumentation uses a defined minimal event schema."

Class: legal/design wording input. Maps to MOB-DG01 acceptance wording.

### F3 - Missing Service-Authorization Legal Input

The L-list covers e-signature, content, DPIA, cession, fee display, tax, and
reconciliation. It does not explicitly cover whether Interdomestik may perform
claims-recovery or legal-service activity per market, including diaspora
cross-border service into DE/CH/AT.

Suggested input: service-authorization / claims-management licensing matrix.

Class: legal input only. Blocks commercial launch confidence, not design prep.

### F4 - Missing Membership Regulatory Classification

The annual membership may raise consumer, insurance-like, or claims-management
classification questions depending on market and promise wording. Treat this as
its own legal input, not a fee-copy subquestion.

Class: legal input only. Blocks public commercial language.

### F5 - Named Handler Copy Depends On Handler-Model Decision

The copy system leans toward named humans, while the enterprise review keeps
named handler vs case team open. Copy keys should mark handler naming as
conditional until that memo is decided.

Class: business/design input. Maps to future case-status copy and MOB-02.

### F6 - Input Docs Use Too Much Binding Language

Several docs say `source_of_truth: false` but use phrases such as "binding",
"authority", "governance violation", and "board verdict". Future cleanup should
use "candidate", "proposed", or "becomes binding only if adopted by a gate."

Class: governance wording input only.

### F7 - Package Manifest Drift

Different docs imply different package sizes and document sets. A single
canonical package manifest would help future gate runners know which input docs
belong together and which are superseded.

Class: doc-hygiene input only.

### F8 - AI/Human ReviewBadge Needs Timing Honesty

ReviewBadge should distinguish "will be reviewed", "under review", and
"reviewed". If AI-generated or automated output appears before human review,
the wording must not imply a human has already approved it. AI transparency
obligations may require legal review.

Class: legal/component-contract input. Maps to future component adoption.

### F9 - Impressum/Company Info Is Legal, Not Just Trust Grammar

German-market diaspora surfaces likely need provider-identification content.
Treat this as legal/company-information input, not only brand credibility.

Class: legal/content input. Maps to future member shell content.

### F10 - Local Evidence Bundles Need A Privacy Memo

Photos may include third-party personal data, plates, faces, and sometimes
injury-adjacent context. MOB-01 should have a memo on pre-handoff controller
posture and member guidance for photographing scenes without over-collecting.

Class: privacy/legal input. Maps to MOB-DG01 copy and evidence coach.

### F11 - Offline Write Copy Must Match The Rule

The error taxonomy rejects silent queues for legal writes. Any copy saying "we
will hold this" can sound like a queue. Use "this was not sent; try again when
back online" for legally meaningful writes unless a future gate defines an
explicit held-item system.

Class: design/copy input. Maps to MOB-03/MOB-05.

### F12 - Stale Repo-State Statements Need Day-Of-Use Verification

Fable flagged possible drift in statements about T-503 and M0-M5 status. This
finding is a hypothesis because Fable had no repository tools in that pass.
Before any docs are edited for state, compare with `current-program.md`,
`current-tracker.md`, and live git history.

Class: verification note only.

## Highest-Value Corrections Before Future Gates

1. Add service-authorization and membership-classification legal inputs.
2. Make fee-promise usage conditional on the expert-cost decision.
3. Replace absolute PII wording with a defined minimal-instrumentation posture.
4. Mark named-handler copy as contingent.
5. Create or designate one package manifest.
6. Add local-evidence privacy memo and ReviewBadge timing states.

## Red Flags For More Fable Work

- Do not let advisory docs become hidden execution authority.
- Do not let Fable invent jurisdictional facts; use `UNVERIFIED`.
- Do not create screens for unpromoted slices.
- Do not turn legal questions into copy fixes when the activity itself may need
  authorization.
- Do not expand artifacts without assigning counsel/reviewer ownership.
