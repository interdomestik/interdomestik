# P39-DG01 IDA Assistance And Recovery Program Design Gate

Status: complete
Slice: `P39-DG01`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-17
Authority: repo-canonical design gate. This document opens `P39 IDA Assistance And Recovery
Program` after `P38-DG22` and promotes exactly one initial slice:
`P39-ASSIST-00 Program Spec And Domain Contracts`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Predecessor Dependency

`P38-DG22 CRM23 And CRM Foundation Closeout` is the direct predecessor for this program.

Predecessor proof:

- `P38-DG22` closeout record:
  `docs/plans/2026-05-16-p38-dg22-crm23-foundation-closeout.md`.
- `P38-DG22` landed through PR `#794`, merge commit
  `bb3657825f58129e843741ddca95e0f1e214b8a8`.
- `P38-CRM23` implementation closeout input landed through PR `#793`, merge commit
  `6674b0e022a6e8b0d828826b40ef49fbb62d8151`.
- Repo-canonical tracker proof is in `docs/plans/current-tracker.md` rows `P38-DG22`, `P39`,
  `P39-DG01`, and `P39-ASSIST-00`.
- No `P38-DG22` Notion sync URL is recorded in repo-canonical sources. If external tracker sync is
  required before legal-counsel review, `P39-ASSIST-00` must record or refresh that external proof
  instead of inventing one here.

P38 is closed. `domain-crm` now has foundations for leads, accounts, contacts, deals, pipelines,
reporting, routing, support handoffs, and timeline. This gate does not reopen P38, does not promote a
CRM continuation slice, and does not move deferred P38 items such as tasks, templates, sequences,
scoring, consent, routing audit retention, automated routing triggers, legacy deal cleanup, or deal
nullability tightening back into active scope.

## Source Inputs

- Existing Help Now / incident guide surface:
  `apps/web/src/app/[locale]/(app)/member/incident-guide/page.tsx`, currently a CTA/handoff page.
- Existing country guidance package: `packages/domain-country-guidance/src/types.ts`,
  `packages/domain-country-guidance/src/data.ts`, and
  `packages/domain-country-guidance/src/service.ts`.
- Existing claims and handoff integration targets: `packages/domain-claims/src/claims/`,
  `packages/domain-claims/src/support-handoffs/`, and `packages/domain-claims/src/staff-claims/`.
- Existing AI extraction/classification boundary: `packages/domain-ai/src/`, including
  `packages/domain-ai/src/types.ts`, `packages/domain-ai/src/models.ts`, and
  `packages/domain-ai/src/telemetry.ts`.
- Existing membership billing and recovery-finance components:
  `packages/domain-membership-billing/src/`,
  `packages/domain-membership-billing/src/success-fees/policy.ts`, and
  `apps/web/src/components/commercial/success-fee-calculator.tsx`.
- Existing recovery decision and agreement surfaces:
  `packages/domain-claims/src/staff-claims/recovery-decision.ts`,
  `packages/domain-claims/src/staff-claims/accepted-recovery-prerequisites.ts`,
  `packages/domain-claims/src/staff-claims/save-escalation-agreement.ts`,
  `apps/web/src/components/staff/claim-action-panel/recovery-decision-section.tsx`, and
  `apps/web/src/components/staff/claim-action-panel/accepted-recovery-prerequisites-section.tsx`.
- Prior commercial and recovery planning inputs:
  `docs/plans/2026-03-08-ai01-domain-ai-evidence.md`,
  `docs/plans/2026-03-10-c02-success-fee-calculator-evidence.md`,
  `docs/plans/2026-03-14-s08-recovery-decision-gate.md`, and
  `docs/plans/2026-03-15-g10-escalation-agreement-collection-fallback.md`.

## Candidate Ranking

| Rank | Candidate                                                                 | Decision             | Rationale                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open `P39 IDA Assistance And Recovery Program` with contracts-first slice | Promote              | Assistance and recovery are now the next repo-canonical product line after P38 closeout, but the legal, medical, PII, finance, and AI-risk surface requires contracts before runtime work.                                       |
| 2    | Continue P38 deferred CRM work                                            | Reject for this gate | Tasks, templates, sequences, scoring, consent, routing audit retention, automated routing triggers, legacy deal cleanup, and deal nullability tightening are explicitly deferred and do not open the assistance/recovery domain. |
| 3    | Implement Help Now directly on `/member/incident-guide`                   | Reject               | The current page is only a CTA/handoff surface. Runtime Help Now behavior must wait for `domain-assistance` contracts, disclaimer discipline, PII rules, and escalation rules.                                                   |
| 4    | Start Green Card country-rule implementation immediately                  | Reject               | Green Card is strategically important, but country-rule metadata, confidence policy, ownership, and fail-closed semantics must be contracted first.                                                                              |
| 5    | Start Professional Recovery runtime workflows                             | Reject               | Recovery activation touches authorization, agreements, consent, professional licensing, finance, and audit custody; program-level rules must be pinned before execution slices.                                                  |

## Program Opened

Open `P39 IDA Assistance And Recovery Program`.

The program creates the repo-canonical planning line for assistance and recovery around:

- `domain-assistance` as a pure rules-first domain package at `packages/domain-assistance/`;
- Help Now as the first free-zone entry point;
- Green Card / country rules as a strategic track;
- assistance packs for incident scene, legal basis, procedure, injury, vehicle damage, invalidity
  review, and recovery eligibility;
- Professional Recovery Mode for authorized, consented, agreement-backed recovery work.

`packages/domain-assistance/` does not exist yet. `packages/domain-country-guidance` exists and is
basic; P39 must begin by adapting it where useful, not by migrating or replacing it wholesale.
Existing `domain-claims`, `domain-ai`, `domain-membership-billing`, recovery decision, commercial
agreement, and success-fee components are integration targets for later slices only.

Canonical naming:

- Product-facing term: `Professional Recovery Mode`.
- Internal mode label: `professional_recovery`.
- Product-facing term: `Help Now`.
- Internal entry label: `help_now`.

## Promoted Slice

Promote exactly one initial slice:

`P39-ASSIST-00 Program Spec And Domain Contracts`

The slice must produce the repo-canonical program specification and bounded domain contract plan
before implementation proceeds. It may define the intended `domain-assistance` public contract,
outcome taxonomy, adapter boundaries, source metadata rules, human-review gates, disclaimer contract,
PII/logging rules, AI provenance fields, and integration map.

It must not implement broad runtime behavior, UI redesign, database migrations, new route behavior,
CRM/claim/handoff creation, AI decision automation, or Professional Recovery execution.

## Promotion / Sign-off

| Item                                    | Status    | Decision                                                                              |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `P38-CRM23`                             | completed | Predecessor implementation completed through PR `#793`.                               |
| `P38-DG22`                              | completed | Predecessor closeout completed through PR `#794`; no P38 continuation slice promoted. |
| `P39`                                   | opened    | New repo-canonical IDA Assistance And Recovery Program is active.                     |
| `P39-DG01`                              | completed | This gate opens P39 and pins the program boundaries.                                  |
| `P39-ASSIST-00`                         | promoted  | Only contracts/spec work is authorized.                                               |
| `P39-ASSIST-01` through `P39-ASSIST-17` | reserved  | Sequencing input only; no implementation authority.                                   |

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
- `P39-ASSIST-15` Consent And Retention
- `P39-ASSIST-16` Internationalization And Localization
- `P39-ASSIST-17` Accessibility Conformance

The map is sequencing input, not implementation authority. Only `P39-ASSIST-00` is promoted by this
gate.

## Domain Architecture Decision

`domain-assistance` must be a pure rules-first domain. It may depend on shared type utilities, but it
must not import `domain-crm` directly and must not create CRM, claim, support-handoff, billing,
agreement, document, outbox, event, or notification records.

`P39-ASSIST-01` must follow the discipline established in earlier domain packages and CRM slices:
pure functions, explicit typed inputs/outputs, injected clock/ID generation where time or identifiers
are needed, in-memory adapter tests, no SQL imports inside domain code, and port-based external
dependencies.

The domain must return typed outcomes and packs, including:

- `AssistanceOutcome`
- `IncidentScenePack`
- `LegalBasisPack`
- `ProcedurePack`
- `InjuryCategoryPack`
- `VehicleDamagePack`
- `InvalidityReviewPack`
- `RecoveryEligibilityPack`

`P39-ASSIST-00` must define `AssistanceOutcome` as a discriminated union with at least:

- `eligible`
- `ineligible`
- `manual_review_required`
- `uncertain`
- `unsupported_country`
- `out_of_scope`
- `requires_member_zone`
- `requires_professional_recovery`

CRM, claim, and handoff creation must happen later through an application/workflow layer that composes
`domain-assistance` with existing `domain-crm`, `domain-claims`, and support-handoff boundaries. That
layer requires a later explicitly promoted slice.

The high-level wire shape for `P39-ASSIST-09` is a typed `AssistanceSessionDigest` handed to an
application-layer composer. The composer, not `domain-assistance`, decides whether to create or link a
CRM lead, claim, support handoff, billing record, agreement record, consent record, or audit entry.

`P39-ASSIST-03` is the only reserved slice authorized to modify or adapt
`packages/domain-country-guidance`. Other P39 slices must consume the existing package shape
read-only unless a later gate explicitly promotes a country-guidance schema or contract change.

Outbox and event emission are a later concern. `domain-assistance` returns typed outcomes only; it
does not emit `CrmDomainEvent`-style events, append outbox rows, or publish notifications.

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

### Disclaimer Discipline

- Free-zone Help Now outputs must carry fixed localized "not legal advice" and "not medical advice"
  disclaimer text. The output is educational, evidence-preserving, and routing-oriented only.
- Member-zone outputs may include more specific guidance and saved assistance context, but still carry
  localized "educational, not professional advice" disclaimer text.
- Professional Recovery Mode outputs that constitute legal, medical, financial, or recovery advice
  must be produced under authorized professional review. The authorized professional, not autonomous
  platform logic or AI, is the advice surface.

### PII And Sensitive Data Discipline

- Free-zone Help Now must not require PII to render first guidance. Anonymous or unauthenticated use
  must not create member-zone records.
- Member-zone outputs may handle PII only under existing auth and tenancy boundaries. No new PII
  storage path is authorized by this gate.
- Professional Recovery may handle medical, legal, financial, and incident PII only after
  authorization, agreement, consent, retention, access-control, and audit discipline are documented in
  later promoted slices.
- Logs, metrics, analytics, outbox payloads, and support events must be aggregate-only or
  identifier-minimal. They must not include injury descriptions, medical facts, legal theories,
  financial terms, evidence details, or raw incident narratives.

### Help Now Escalation Policy

When Help Now uncovers a member-zone or Professional Recovery need, the session may be preserved only
as an anonymous digest or attached to an authenticated member after explicit consent. The UI may offer
an escalation CTA to member-zone assistance or staff handoff, but no member-zone record, claim, CRM
lead, support handoff, agreement, or recovery record may be created automatically from the free zone.

### Professional Recovery Authorization Model

Professional Recovery activation follows this high-level state model:

`requested` -> `authorization_pending` -> `agreement_pending` -> `consent_recorded` ->
`professional_review_pending` -> `active_recovery` -> `settlement_or_resolution_pending` -> `closed`

Activation rights:

- A member may request Professional Recovery or consent to escalation.
- Staff may prepare intake, validate completeness, and route for review.
- Only an authorized professional for the relevant jurisdiction may approve legal-recovery activation
  or present final legal advice.
- Finance or operations users may record ledger and audit artifacts only after activation
  prerequisites are satisfied; they cannot activate recovery alone.

Every later Professional Recovery slice must account for per-jurisdiction licensing or regulator
requirements, including whether a licensed lawyer, claims professional, medical expert, or other
regulated professional is required before advice, representation, POA acceptance, settlement handling,
expert-cost authorization, or success-fee collection.

## Country Rule Metadata

Every country-specific rule used by P39 must carry:

- `country`
- `sourceReference`
- `owner`
- `lastReviewed`
- `confidence`

The numeric confidence threshold is a required `P39-ASSIST-00` deliverable. This gate authorizes the
contract for a threshold, not the threshold value itself. Until the promoted slice pins that value,
country-rule consumers must fail closed for any rule that is missing, stale, conflicting,
unsupported, or below the slice-defined threshold.

Fail-closed means the domain returns a typed uncertain/manual-review outcome and does not present the
result as eligible, complete, or final.

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

AI-produced assistance inputs must carry typed provenance fields before any human-review consumer can
see or rely on them:

- `aiConfidence`
- `aiModelVersion`
- `aiWorkflowName`
- `aiPromptOrSchemaVersion`
- `aiRunId`

If `domain-ai` already exposes equivalent fields in the implementation slice, `P39-ASSIST-00` may
map to those existing names instead of inventing new ones, but the provenance requirement remains
mandatory.

## Risks And Open Questions

- Country-rule data freshness and maintenance ownership need a named owner, review cadence, and stale
  rule SLA.
- AI hallucination or overconfident classification could produce an incorrect eligible-looking legal
  basis unless every AI-derived field is provenance-tagged and human-review bounded.
- Injury, medical, legal, and financial data may trigger GDPR and jurisdiction-specific health-data or
  professional-secrecy obligations.
- Recovery success-fee accounting, refunds, expert-cost authorization, and settlement handling need
  finance and audit custody before runtime activation.
- Members may self-classify into the wrong zone; Help Now escalation must preserve consent and avoid
  silent record creation.
- Green Card cases can involve multiple jurisdictions with conflicting rules; conflicts must fail
  closed into manual review.
- Insurers or counterparties may dispute platform-derived eligibility assessments; outputs must be
  evidence-preserving and clearly non-final until professional review.
- Professional Recovery licensing requirements may vary by country, claim type, and representation
  posture.
- Retention, deletion, subject-access, and evidence-custody rules are not defined by this gate and are
  reserved for later slices.

## Approval Bar

Approve this gate only if reviewers agree that:

- P39 opens after completed `P38-DG22` without reopening P38 or promoting deferred P38 work;
- `domain-assistance` is pure, rules-first, SQL-free, and has no direct `domain-crm` import;
- the first promoted slice is contracts/spec only;
- no runtime implementation, UI redesign, DB migration, proxy edit, canonical route change, or
  auth/tenancy/routing refactor is authorized;
- country rules require metadata, confidence policy, ownership, review dates, and fail-closed
  uncertainty behavior;
- AI is assistant-only and never final decision-maker;
- legal/medical disclaimer discipline and PII/logging discipline are encoded at program level;
- Professional Recovery cannot activate without authorization, agreement, consent, professional
  review, and finance/audit custody.

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
- outbox/event emission from the pure domain package;
- autonomous AI decisioning;
- README, AGENTS.md, or broad architecture-doc updates.

## Acceptance Criteria For P39-ASSIST-00

`P39-ASSIST-00` is complete only when it records:

- the first public `domain-assistance` type contract and minimum `AssistanceOutcome` taxonomy;
- the exact pack contracts and fail-closed outcome semantics;
- the country-rule metadata contract, numeric confidence threshold, stale-rule policy, and adapter
  strategy for `domain-country-guidance`;
- the disclaimer contract for free-zone, member-zone, and Professional Recovery outputs;
- the PII, sensitive-data, logging, and retention placeholders required before later runtime slices;
- the free/member/recovery service boundary;
- the Help Now escalation and explicit-consent boundary;
- the Professional Recovery state model, activation rights, and licensing-review placeholder;
- the human-review and AI-limited-role boundary;
- the AI provenance fields or mapping to existing `domain-ai` provenance fields;
- the `AssistanceSessionDigest` or equivalent integration wire shape for later CRM, claim, handoff,
  billing, agreement, consent, and finance/audit slices;
- the no-direct-CRM-import dependency rule;
- the proof plan for the first core-package implementation slice.

## Verification For This Gate

Required local verification for this docs-only gate:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`

No product test suite is required because this gate changes planning documents only.

## P39-ASSIST-00 Verification Sketch

The implementation PR for `P39-ASSIST-00` remains contracts/spec only unless a later approved gate
changes scope. Expected proof:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- package type-check only if it creates TypeScript contract files under `packages/domain-assistance/`
- focused contract tests only if TypeScript contract helpers are introduced

No E2E or product test suite is required for a contracts-only docs/spec slice unless the slice edits
runtime, UI, routing, schema, auth, tenancy, or verification surfaces.
