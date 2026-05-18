# P39-DG05 Privacy, Consent, And Sensitive Document Governance Design Gate

Status: complete
Slice: `P39-DG05`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-18
Authority: repo-canonical interruption gate. This document closes the post-`P39-ASSIST-05`
sequencing gap and promotes exactly one next implementation slice:
`P39-PRIV01 Privacy, Consent, And Sensitive Document Foundation`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` remains the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Predecessor Dependency

`P39-ASSIST-05 Procedure Guide` is the direct predecessor for this gate.

Predecessor proof:

- `P39-DG04 Procedure Guide Design Gate` is recorded in
  `docs/plans/2026-05-18-p39-dg04-procedure-guide-design.md`.
- `P39-ASSIST-05` is recorded as complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- `P39-ASSIST-05` closed the current pure-domain procedure-guide sequence without authorizing
  product runtime UI, DB migrations, CRM/claim/handoff creation, outbox/event emission,
  Professional Recovery activation, autonomous AI decisioning, proxy/canonical route/auth/tenancy
  changes, Stripe, README, AGENTS, or broad architecture-doc work.

The next ordinary assistance slice would be `P39-ASSIST-06 Injury Category Pre-check`. This gate
intentionally interrupts that sequence because injury, invalidity, vehicle evidence, document
upload, AI extraction, support handoff, and Professional Recovery flows all depend on a stronger
privacy, consent, document-classification, access-control, and audit foundation.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Procedure guide gate: `docs/plans/2026-05-18-p39-dg04-procedure-guide-design.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Existing AI provenance tables and contracts: `packages/database/src/schema/ai.ts` and
  `packages/domain-ai`.
- Existing document/claim surfaces: `packages/database/src/schema/documents.ts`,
  `packages/database/src/schema/claims.ts`, and `packages/domain-claims`.
- Existing support-handoff and recovery/commercial surfaces:
  `packages/database/src/schema/crm.ts`, `packages/database/src/schema/claim-commercial.ts`,
  `packages/domain-crm`, and `packages/domain-claims/src/staff-claims`.
- Privacy/legal references:
  - GDPR Article 5 purpose limitation, data minimization, storage limitation, integrity, and
    accountability.
  - GDPR Article 6 lawful basis for personal-data processing.
  - GDPR Article 7 consent conditions.
  - GDPR Article 9 special-category data, including health data and legal-claims exceptions.
  - GDPR Article 25 data protection by design and by default.
  - GDPR Article 30 processing records.
  - GDPR Article 32 security of processing.
  - GDPR Article 35 Data Protection Impact Assessment.
  - EDPB Guidelines 05/2020 on consent under Regulation 2016/679.
  - WP29/EDPB DPIA high-risk guidance.

This design record is a product and engineering governance artifact, not legal advice. Formal
privacy notices, service terms, authorization templates, and DPIA sign-off require qualified legal
review before live production use.

## Decision

Promote exactly one implementation slice:

`P39-PRIV01 Privacy, Consent, And Sensitive Document Foundation`

`P39-PRIV01` must become the cross-cutting prerequisite before resuming `P39-ASSIST-06 Injury
Category Pre-check`, `P39-ASSIST-07 Vehicle Damage Pre-check`, `P39-ASSIST-08 Invalidity
Coefficient Review`, assistance-session persistence, document upload expansion, AI extraction for
medical or sensitive documents, CRM/claim/handoff integration, or Professional Recovery activation.

The promoted slice must define and implement the narrow foundation required to prove:

- privacy-zone separation for Free / Self-service, Member / Assistance, and Professional Recovery;
- granular consent and authorization event contracts;
- document sensitivity classification;
- purpose-limited document processing metadata;
- role-scoped access policy contracts;
- document access/audit log contracts;
- AI extraction consent and audit boundaries;
- third-party sharing consent contracts;
- retention and data-subject request contract surfaces.

The first implementation may be domain/schema/contract-first and does not need to expose full
runtime UI. It must not create broad upload workflows, runtime assistance UI, CRM/claim/handoff
side effects, Professional Recovery activation, or autonomous AI decisioning.

## Candidate Ranking

| Rank | Candidate                                                            | Decision             | Rationale                                                                                                                                                                                       |
| ---- | -------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P39-PRIV01 Privacy, Consent, And Sensitive Document Foundation`     | Promote              | Injury, invalidity, AI extraction, upload, sharing, and recovery flows process sensitive evidence and need consent, purpose, access, audit, and retention foundations before further expansion. |
| 2    | `P39-ASSIST-06 Injury Category Pre-check`                            | Block behind PRIV01  | Injury pre-check naturally involves health data, medical documents, and human-review boundaries; implementing it first would backfill consent and access controls after the risky path exists.  |
| 3    | `P39-ASSIST-07 Vehicle Damage Pre-check`                             | Defer                | Vehicle evidence can include images, plates, identities, location, and insurer documents and should consume the same document-classification and access model.                                  |
| 4    | Runtime member upload UI for assistance packs                        | Reject for this gate | Upload UI would gather personal and possibly special-category data before the consent, purpose, and access contract is formalized.                                                              |
| 5    | Professional Recovery authorization, POA, agreements, or legal share | Reject for this gate | Professional Recovery requires authorization, service agreement, sharing consent, legal/professional review, and finance/audit trail and must consume the PRIV01 foundation.                    |

## Privacy Zones

`P39-PRIV01` must codify three product privacy zones.

### Zone A: Free / Self-Service

Purpose:

- orientation;
- automatic preliminary document check;
- missing-document checklist;
- non-final next-step guidance;
- user-initiated escalation prompt.

Rules:

- Free-zone upload, if later authorized, must require purpose-specific notice before upload.
- Medical or health documents require separate explicit consent before processing.
- Free-zone outputs must not create CRM, claim, handoff, or recovery records unless a later
  application-layer gate explicitly authorizes a consented escalation flow.
- Documents must not be reused for marketing, profiling, training, partner analytics, insurer
  sharing, lawyer sharing, expert sharing, or recovery activation without a later purpose-specific
  basis and user action.

Required user-facing concept for later UI copy:

> Documents uploaded in Free / Self-service are used only to generate the preliminary automatic
> check, identify missing documents, and show the next step for this case.

### Zone B: Member / Assistance

Purpose:

- membership servicing;
- case opening;
- evidence organization;
- member-visible timeline/status;
- support handoff;
- staff triage;
- document extraction/classification;
- procedural guidance;
- assistance-session continuity.

Rules:

- Membership terms are not a blanket consent for every downstream processing purpose.
- Case opening, medical document processing, AI extraction, document storage, staff triage,
  insurer/expert/lawyer sharing, and billing must each be represented as separate purpose surfaces
  when applicable.
- Member-zone documents may be linked to claims or assistance sessions only under the relevant
  purpose and access policy.
- Agent/promoter users must not receive access to sensitive case documents or medical documents.

### Zone C: Professional Recovery

Purpose:

- authorized representation or intermediary handling;
- insurer, bureau, expert, lawyer, or court-facing document sharing;
- agreement-backed service delivery;
- expert-cost approval;
- legal escalation;
- recovery finance and success-fee audit.

Rules:

- Professional Recovery requires explicit authorization, service agreement, consent to process,
  and consent to share with the specific recipient class where needed.
- Power of attorney / authorization, service agreement, expert consent, lawyer/court consent, and
  finance ledger must be separate flows, not hidden in generic terms acceptance.
- Medical documents and professional-secret materials require stricter classification, access, and
  audit rules.

## Consent And Authorization Contract

`P39-PRIV01` must persist or define a persistence-ready consent event model that records at least:

- actor/user/member id;
- tenant id;
- case, claim, assistance session, or document scope where applicable;
- consent type;
- processing purpose;
- document category or sensitivity class where applicable;
- recipient class where sharing is authorized;
- lawful-basis marker and Article 9 marker where applicable;
- terms version and privacy version;
- locale;
- accepted, declined, or withdrawn status;
- accepted/declined/withdrawn timestamp;
- source surface;
- IP hash or equivalent privacy-preserving request proof;
- device/session proof where available;
- evidence snapshot reference;
- superseded consent event reference when applicable.

Initial consent and authorization types must cover:

- `membership_terms`;
- `privacy_policy`;
- `case_opening`;
- `document_upload_processing`;
- `medical_document_processing`;
- `ai_document_extraction`;
- `share_with_insurer`;
- `share_with_bureau`;
- `share_with_expert`;
- `share_with_lawyer`;
- `professional_recovery_authorization`;
- `service_agreement`;
- `power_of_attorney`;
- `expert_cost_approval`;
- `court_escalation`;
- `billing_and_success_fee_processing`;
- `data_export_request`;
- `data_erasure_request`.

Consent checks must fail closed when the latest applicable event is missing, withdrawn, stale by
policy, scoped to another purpose, scoped to another case/document, or does not cover the requested
recipient class.

## Document Classification Contract

Every later document upload path that touches assistance, claims, AI extraction, or recovery must
attach a sensitivity and purpose classification. `P39-PRIV01` must define the initial taxonomy:

| Class                                | Examples                                                                                      | Minimum policy                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `public_low`                         | vehicle photo without identifiable people, generic checklist, user-visible guidance           | Standard access and short audit trail.                                                                                                  |
| `personal`                           | policy, registration, ID document, insurer email, claim correspondence                        | Member/staff scoped access, purpose metadata, document access logs.                                                                     |
| `sensitive_health`                   | medical report, diagnosis, discharge note, RTG/MRI/CT result, rehabilitation, invalidity docs | Explicit consent, Article 9 marker, medical/professional review scope, strict access, AI extraction restrictions, and retention policy. |
| `legal_professional_recovery`        | lawyer communication, complaint strategy, draft lawsuit, POA, settlement authority            | Professional Recovery authorization, legal/professional access scoping, stricter audit, sharing consent, and no agent/promoter access.  |
| `financial_billing_or_recovery_cost` | expert invoice, success-fee statement, payment authorization, recovered amount                | Billing/recovery purpose, finance-role access, audit, and retention tied to legal/accounting obligations.                               |

Document metadata must support:

- allowed purposes;
- allowed recipient classes;
- required consent types;
- retention policy;
- human-review requirement;
- AI extraction allowed/blocked state;
- redaction requirement where applicable;
- source upload surface;
- sensitivity class;
- access policy id or equivalent policy reference.

## Role-Based Access Contract

`P39-PRIV01` must define role policy before runtime exposure:

- Member: may view own documents and consent history for the relevant case/session.
- AI extraction service: may process only documents whose purpose and consent allow extraction;
  output remains tenant/case scoped and human-review-gated where sensitive.
- Claims operator/staff: may access documents required for assigned triage/handling and must be
  audit logged.
- Medical reviewer / censor: may access only relevant `sensitive_health` documents for the scoped
  review purpose.
- Lawyer: may access only documents shared for representation/legal escalation under consent and
  authorization.
- Agent/promoter: must not access sensitive case documents, medical documents, legal strategy, or
  professional recovery materials; only aggregate/commercial membership status may be exposed where
  already authorized.
- Admin: access must be exceptional, purpose-scoped, and audit logged.

## AI Processing Contract

AI may extract or classify data only when the document's purpose, sensitivity class, and consent
state allow it.

AI must not:

- make final legal, medical, financial, recovery, or claim-acceptance decisions;
- use medical/sensitive documents for model training or commercial profiling;
- persist raw documents outside the authorized tenant/system boundary;
- expose outputs to agents/promoters;
- bypass human review for sensitive or uncertain outputs.

AI processing must record:

- workflow;
- model/vendor boundary;
- zero-retention/no-training posture where vendor processing is used;
- prompt/schema version;
- document id and entity scope;
- consent event reference;
- sensitivity class;
- output confidence;
- review status;
- reviewer id where reviewed;
- audit timestamp.

Existing `ai_runs` and `document_extractions` provide useful provenance surfaces, but this gate does
not assert that they are sufficient for medical/sensitive assistance flows without the PRIV01
consent and classification layer.

## Data Subject Rights, Retention, And Trust Center

`P39-PRIV01` must define contract surfaces for:

- data export requests;
- erasure requests;
- consent withdrawal;
- restriction of processing where applicable;
- retention policy by document class and case state;
- legal/accounting hold exceptions;
- Trust Center copy requirements.

Trust Center copy must explain:

- what data is collected;
- why it is collected;
- who can see it;
- how documents are stored;
- how AI is used and what AI does not decide;
- when documents are shared with insurers, bureaus, experts, or lawyers;
- how consent can be withdrawn;
- how export/erasure requests are made;
- how long documents are retained.

## Non-Goals

This gate does not authorize:

- product runtime UI or `/member/incident-guide` redesign;
- new document upload UX;
- changes to `apps/web/src/proxy.ts`;
- canonical route changes for `/member`, `/agent`, `/staff`, or `/admin`;
- auth, tenancy, routing, or broad domain architecture refactors;
- broad database migrations beyond the later bounded PRIV01 slice;
- RLS changes outside the promoted privacy/consent foundation slice;
- CRM, claim, support-handoff, outbox, event, notification, agreement, POA, billing, or recovery
  record creation;
- direct `domain-crm` imports from `domain-assistance`;
- autonomous AI decisioning or new AI final-decision workflows;
- Professional Recovery activation, representation, settlement, expert-cost, success-fee, or
  finance-ledger runtime work;
- Stripe;
- README, AGENTS.md, or broad architecture-doc edits.

## Acceptance Criteria For P39-PRIV01

- Privacy zones are encoded in public contracts or persistence-ready types.
- Consent/authorization events are versioned, purpose-scoped, actor-scoped, locale-aware, and
  withdrawal-aware.
- Medical document processing requires explicit consent and a special-category marker.
- Document sensitivity classification exists with allowed purposes, allowed recipients, required
  consent, retention, AI allowance, and human-review metadata.
- Role access policy denies agent/promoter access to sensitive medical/case documents.
- Document access logs or persistence-ready access-log contracts exist for sensitive and
  professional-recovery documents.
- AI extraction cannot run on sensitive documents without the required consent and purpose scope.
- AI outputs remain non-final and human-review-gated for medical, legal, recovery, and uncertain
  outputs.
- Third-party sharing with insurer, bureau, expert, lawyer, or court is purpose-specific and
  recipient-class-specific.
- Data export, erasure, withdrawal, and retention-policy surfaces are represented.
- The slice records whether an Assistance/AI DPIA is required before broad runtime exposure.
- The implementation does not introduce runtime UI, broad upload flows, proxy edits, canonical
  route edits, auth/tenancy/routing refactors, direct CRM imports from `domain-assistance`,
  CRM/claim/handoff creation, outbox/event emission, Professional Recovery activation, autonomous AI
  decisioning, Stripe, README, AGENTS, or broad architecture-doc changes.

## Implementation Review Plan

When `P39-PRIV01` starts, the main agent remains on the critical path and owns final integration.
Because the slice touches GDPR, health data, professional secrecy, AI processing, and document
access, the PR must include independent review proof for:

- GDPR lawful-basis and special-category boundary;
- consent withdrawal and purpose limitation;
- medical/sensitive document classification;
- agent/promoter access denial;
- AI no-final-decision and no-training/retention posture;
- document access logging and auditability;
- RLS/tenant-scope design if persistence is added;
- repo-size budget and plan/tracker updates.

Subagents are preferred when available. If runtime tooling blocks subagents, the PR must record the
blocker and include the strongest available local fallback review.

## Risks And Open Questions

- Formal legal review is still required before publishing final terms, privacy copy, POA,
  authorization, or Professional Recovery agreements.
- Different jurisdictions may require different authorization wording and professional-secrecy
  treatment.
- Existing document and AI tables may need extension rather than replacement; PRIV01 must avoid a
  broad document-storage redesign unless the implementation gate explicitly proves it is necessary.
- DPIA scope should be defined before medical-document AI extraction becomes runtime-visible.
- Retention defaults may conflict with claim/recovery evidence needs and data-subject erasure
  expectations; legal-hold exceptions must be explicit.
- Third-party vendors for AI, storage, communications, or document signing need DPA and no-training
  posture review before sensitive data is processed through them.

## Approval Bar

Approve this gate only if reviewers agree that:

- `P39-ASSIST-05` is closed and the ordinary `P39-ASSIST-06` injury path should be blocked until
  privacy/consent foundations are promoted;
- only `P39-PRIV01` is promoted;
- Free, Member, and Professional Recovery zones are explicitly separated;
- general terms are not treated as blanket consent for health data, AI extraction, third-party
  sharing, or Professional Recovery;
- sensitive/health data requires explicit consent or another documented Article 9 exception before
  processing;
- agent/promoter access to sensitive case and health documents is denied by design;
- AI extraction remains non-final and purpose-limited;
- consent, document classification, access logs, and retention are first-class product constraints;
- runtime UI, upload flows, CRM/claim/handoff side effects, Professional Recovery activation, and
  later assistance DGs remain blocked until PRIV01 or a later repo-canonical gate explicitly opens
  them.

## Completion State

| Item                                                             | State    | Notes                                                                                           |
| ---------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `P39-DG05 Privacy, Consent, And Sensitive Document Governance`   | complete | Interrupts the ordinary P39 assistance sequence after `P39-ASSIST-05`.                          |
| `P39-PRIV01 Privacy, Consent, And Sensitive Document Foundation` | promoted | Cross-cutting prerequisite before injury, invalidity, upload, AI-sensitive, and recovery flows. |
| `P39-ASSIST-06 Injury Category Pre-check`                        | blocked  | Must wait for PRIV01 or a later explicit repo-canonical override.                               |
| `P39-ASSIST-07` through Professional Recovery runtime work       | reserved | No implementation authority from this gate.                                                     |

## Verification

Required local verification for this gate:

```bash
git diff --check
pnpm plan:status
pnpm track:audit
pnpm plan:audit
pnpm docs:verify
pnpm repo:size:check
```

No product test suite is required for this docs/design-gate slice unless docs tooling or repo-size
guards require it.
