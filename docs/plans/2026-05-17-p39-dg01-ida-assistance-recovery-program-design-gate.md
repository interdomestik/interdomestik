# P39-DG01 IDA Assistance And Recovery Program Design Gate

Status: complete
Slice: `P39-DG01`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-17
Authority: repo-canonical design gate. This document opens `P39 IDA Assistance And Recovery
Program` after `P38-DG22` and promotes exactly one initial slice:
`P39-ASSIST-00 Program Spec And Domain Contracts`.

Status vocabulary: `complete` records a completed design gate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

## Predecessor Dependency

`P38-DG22 CRM23 And CRM Foundation Closeout` is the direct predecessor for this program.

P38 is closed. `domain-crm` now has foundations for leads, accounts, contacts, deals, pipelines,
reporting, routing, support handoffs, and timeline. This gate does not reopen P38, does not promote a
CRM continuation slice, and does not move deferred P38 items such as tasks, templates, sequences,
scoring, consent, routing audit retention, automated routing triggers, legacy deal cleanup, or deal
nullability tightening back into active scope.

## Program Opened

Open `P39 IDA Assistance And Recovery Program`.

The program creates the repo-canonical planning line for assistance and recovery around:

- `domain-assistance` as a pure rules-first domain package;
- Help Now as the first free-zone entry point;
- Green Card / country rules as a strategic track;
- assistance packs for incident scene, legal basis, procedure, injury, vehicle damage, invalidity
  review, and recovery eligibility;
- Professional Recovery Mode for authorized, consented, agreement-backed recovery work.

`packages/domain-assistance` does not exist yet. `/member/incident-guide` is currently a CTA/handoff
page. `packages/domain-country-guidance` exists and is basic; P39 must begin by adapting it where
useful, not by migrating or replacing it wholesale. Existing `domain-claims`, `domain-ai`,
`domain-membership-billing`, recovery decision, commercial agreement, and success-fee components are
integration targets for later slices only.

## Promoted Slice

Promote exactly one initial slice:

`P39-ASSIST-00 Program Spec And Domain Contracts`

The slice must produce the repo-canonical program specification and bounded domain contract plan
before implementation proceeds. It may define the intended `domain-assistance` public contract,
outcome taxonomy, adapter seams, source metadata rules, human-review gates, and integration map.

It must not implement broad runtime behavior, UI redesign, database migrations, new route behavior,
CRM/claim/handoff creation, AI decision automation, or Professional Recovery execution.

## Epic Map

- `P39-ASSIST-00` Program spec & domain contracts
- `P39-ASSIST-01` `domain-assistance` core package
- `P39-ASSIST-02` Help Now / Incident Scene Pack
- `P39-ASSIST-03` Green Card / Country Rules adapter
- `P39-ASSIST-04` Legal Basis Pre-check
- `P39-ASSIST-05` Procedure Guide
- `P39-ASSIST-06` Injury Category Pre-check
- `P39-ASSIST-07` Vehicle Damage Pre-check
- `P39-ASSIST-08` Invalidity Coefficient Review, member/human-review only
- `P39-ASSIST-09` Assistance session to CRM/Claim/Handoff integration
- `P39-ASSIST-10` Professional Recovery activation
- `P39-ASSIST-11` Agreements / authorization / POA
- `P39-ASSIST-12` Expert cost + success fee ledger
- `P39-ASSIST-13` Member UI + Staff Ops UI
- `P39-ASSIST-14` E2E/security/release gate

The map is sequencing input, not implementation authority. Only `P39-ASSIST-00` is promoted by this
gate.

## Domain Architecture Decision

`domain-assistance` must be a pure rules-first domain. It may depend on shared type utilities, but it
must not import `domain-crm` directly and must not create CRM, claim, support-handoff, billing,
agreement, document, or notification records.

The domain must return typed outcomes and packs, including:

- `AssistanceOutcome`
- `IncidentScenePack`
- `LegalBasisPack`
- `ProcedurePack`
- `InjuryCategoryPack`
- `VehicleDamagePack`
- `InvalidityReviewPack`
- `RecoveryEligibilityPack`

CRM, claim, and handoff creation must happen later through an application/workflow layer that composes
`domain-assistance` with existing `domain-crm`, `domain-claims`, and support-handoff boundaries. That
layer requires a later explicitly promoted slice.

## Service Boundaries

P39 uses three commercial and safety zones:

- Free zone: Help Now and initial incident scene guidance. Output is educational, evidence-preserving,
  and routing-oriented. Help Now becomes the first entry in the free zone before other assistance
  services.
- Member zone: member-only pre-checks, saved assistance sessions, invalidity coefficient review, and
  human-review requests. Invalidity coefficient handling is never free-zone automation and is always
  member/human-review only.
- Professional Recovery Mode: services 7-10 and later recovery execution require explicit
  authorization, agreement, consent, finance/audit trail, and staff/professional custody before any
  recovery work begins.

Green Card is its own strategic track. It may use a country-rules adapter and `domain-country-guidance`
metadata, but it must not be collapsed into generic incident guidance.

## Country Rule Metadata

Every country-specific rule used by P39 must carry:

- `country`
- `sourceReference`
- `owner`
- `lastReviewed`
- `confidence`

Rules must fail closed when the rule is missing, stale, conflicting, unsupported, or below the
confidence threshold defined by the promoted slice. Fail-closed means the domain returns a typed
uncertain/manual-review outcome and does not present the result as eligible, complete, or final.

## Human Review And AI Boundaries

Human review is mandatory for:

- invalidity coefficient review;
- uncertain or missing country rules;
- disputed legal-basis or procedure outputs;
- injury and vehicle-damage outputs that affect recovery eligibility;
- Professional Recovery activation;
- agreement, authorization, POA, expert-cost, success-fee, or recovery-finance decisions.

AI may assist only with extraction, classification, summarization, and draft organization. AI must not
be the final decision-maker for legal basis, eligibility, invalidity coefficient, recovery activation,
agreement sufficiency, POA sufficiency, expert-cost authorization, success-fee collection, or claim/
CRM/handoff creation.

## Non-Goals

This gate does not authorize:

- product runtime implementation beyond `P39-ASSIST-00` planning/contracts;
- UI redesign or broad member/staff ops redesign;
- `apps/web/src/proxy.ts` changes;
- canonical route changes or bypasses for `/member`, `/agent`, `/staff`, or `/admin`;
- auth/session layering, tenancy architecture, routing architecture, or domain architecture refactors;
- database migrations yet, unless a later slice narrowly justifies one with explicit schema,
  migration, RLS, rollback, and proof requirements;
- Stripe usage in V3 pilot flows;
- direct `domain-assistance` imports from `domain-crm`;
- CRM/claim/handoff creation inside the pure domain package;
- autonomous AI decisioning;
- README, AGENTS.md, or broad architecture-doc updates.

## Acceptance Criteria For P39-ASSIST-00

`P39-ASSIST-00` is complete only when it records:

- the first public `domain-assistance` type contract and outcome taxonomy;
- the exact pack contracts and fail-closed outcome semantics;
- the country-rule metadata contract and adapter strategy for `domain-country-guidance`;
- the free/member/recovery service boundary;
- the human-review and AI-limited-role boundary;
- the integration map for later CRM, claim, handoff, billing, agreement, consent, and finance/audit
  slices;
- the no-direct-CRM-import dependency rule;
- the proof plan for the first core-package implementation slice.

## Verification For This Gate

Required local verification for this docs-only gate:

- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`

No product test suite is required because this gate changes planning documents only.
