---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-09
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/2026-07-09-mob-02a-closeout.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/product/2026-07-03-mobile-program-authority-packet-part-1.md
  - docs/product/2026-07-03-mobile-program-authority-packet-part-2.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
---

# MOB-DG04 Current Authority: Next Slice Selection

> Status: current-authority/design-gate selection after `MOB-02a` closeout.
> This record does not promote runtime work.

## Resolver Input

Before this gate, the expected resolver state was:

```text
status: blocked_requires_current_authority
activeSlice: null
```

`MOB-02a` is complete and consumed by PR `#1322`. No replacement runtime slice
was promoted by the closeout. A fresh current-authority/design-gate selection is
therefore required before any follow-on runtime work.

## Reviewer Portal Intake

Reviewer evidence was gathered through `https://reviewer-ecohub.vercel.app`.
The live handoff endpoint guardrails state that reviewer handoffs are evidence
intake only, runtime work is not authorized by that endpoint, and promotion
requires repo current-authority/design-gate.

For `MOB-DG04`, `MOB03-DPIA-CONSENT`, `MOB03-ACCESS-THREAT`, and
`MOB05B-POA-ESIGN`, the latest per-item correction state on 2026-07-09 had
`correctionStatus=confirmed` and `decision=approve`. Some correction handoffs
are item-level submissions and therefore show `complete=false`; the gate uses
the latest per-item review state, not a single full-step submission flag.

## Candidate Slices Considered

| Candidate                                                | Authority Source                                              | Concrete? | Entry Evidence Complete? | Evidence Gate                                  | Blockers                                                                                                                                                                                                              | Recommendation                               |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------: | -----------------------: | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `MOB-03` umbrella                                        | Enterprise register `ENT-C01`; mobile authority packet part 2 |        No |                       No | `MOB-DG04`                                     | Umbrella scope; medical/injury paths require signed/accepted DPIA and Art. 9 authority; consent-record authority and access/threat proof remain requirements, not completed runtime authority.                        | Do not promote.                              |
| `MOB-03a` non-medical vault + consent display foundation | Reviewer `DG04-EXACT-SCOPE`; mobile authority packet part 2   |    Nearly |                       No | Future `MOB-DG04` addendum or replacement gate | Needs exact car/property-only scope, privacy/legal owner evidence, consent-record authority, access-role boundary, threat-model recheck, erasure/redaction proof, and exclusions translated into repo-safe authority. | Park as nearest candidate; not promoted now. |
| `MOB-05b` Agreement Ceremony / POA e-sign                | Enterprise register `ENT-C03`; mobile authority packet part 2 |        No |                       No | Future `MOB-DG05`                              | Blocked behind `MOB-03` consent records and L1 POA/e-sign matrix; Agreement Ceremony writers remain forbidden.                                                                                                        | Do not promote.                              |

## Entry Evidence Verdict

The reviewer portal corrections close the prior `needs_correction` state for
the intake questions. They do not by themselves supply the missing legal,
privacy, data-model, or runtime authority needed to promote `MOB-03` or
`MOB-05b`.

| Requirement                        | Status                         | Evidence Source                                                                   | Notes                                                                                                                                                                           |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DG04 candidate rule                | Accepted as gate rule          | `DG04-CANDIDATE` latest confirmed reviewer item                                   | Do not promote runtime unless exactly one candidate has complete evidence.                                                                                                      |
| Exact narrow `MOB-03` scope        | Accepted as requirement        | `DG04-EXACT-SCOPE` latest confirmed reviewer item                                 | Candidate must be vault + consent display foundation only, with medical/injury disabled unless DPIA allows it.                                                                  |
| DG04 entry evidence list           | Accepted as requirement        | `DG04-ENTRY-EVIDENCE` latest confirmed reviewer item                              | Requires DPIA/Art. 9, consent-record fields, access-role boundary, threat recheck, erasure proof, and exclusions.                                                               |
| Stop conditions                    | Accepted                       | `DG04-STOP-CONDITIONS` latest confirmed reviewer item                             | Stop on medical data without DPIA, schema/RLS without authority, sponsor/payer document sharing without consent, claim writers, Agreement Ceremony, billing, or broad `MOB-03`. |
| Privacy/legal owner                | Missing as authority           | `M03-DPIA-OWNER` latest confirmed reviewer item                                   | The accepted answer says not to accept without name, role, date, and evidence reference. It does not itself provide that authority.                                             |
| Art. 9 / medical boundary          | Missing for medical/injury     | `M03-ART9-SCOPE` latest confirmed reviewer item; L3 template status `not started` | Medical/injury data remains blocked until signed/accepted DPIA/Art. 9 authority exists.                                                                                         |
| Consent-record authority           | Missing as runtime authority   | `M03-CONSENT-RECORD` latest confirmed reviewer item                               | Minimal fields are accepted as requirement, but this is not migration/schema/runtime authority.                                                                                 |
| Non-medical fallback               | Accepted as possible direction | `M03-NO-MEDICAL-FALLBACK` latest confirmed reviewer item                          | Car/property-only planning may continue if written clearly and medical/injury is disabled.                                                                                      |
| Access roles and document boundary | Missing as runtime proof       | `M03-ACCESS-ROLES`; `M03-DOCUMENT-BOUNDARY` latest confirmed reviewer items       | Requirements accepted; no implementation authority or consolidated proof yet.                                                                                                   |
| Threat recheck and erasure proof   | Missing as runtime proof       | `M03-THREAT-RECHECK`; `M03-ERASURE-AUDIT` latest confirmed reviewer items         | Requirements accepted; proof must be produced before runtime promotion.                                                                                                         |
| POA/e-sign owner and matrix        | Missing for `MOB-05b`          | `M05B-POA-OWNER`; `M05B-ESIGN-MATRIX` latest confirmed reviewer items             | Requirements accepted; Agreement Ceremony remains blocked.                                                                                                                      |

## Decision

No runtime slice is promoted by `MOB-DG04`.

Reason: the latest reviewer corrections confirm what the next gate must require,
but they do not provide the concrete repo-safe legal/privacy owner, DPIA/Art. 9
authority, consent-record authority, access/threat proof, erasure proof, or
exact non-medical `MOB-03a` implementation boundary needed to make the resolver
ready.

Runtime work remains unauthorized. The expected resolver state remains:

```text
status: blocked_requires_current_authority
activeSlice: null
```

## Scope Exclusions

This gate does not authorize:

- full `MOB-03` or full `MOB-05b`;
- medical or injury data intake, display, upload, storage, or processing;
- claim writers, status mutation, outbox writes, or new lifecycle events;
- Agreement Ceremony writers, ProposalCard approval, POA runtime, or e-sign
  runtime;
- schema/RLS/migrations;
- auth, proxy, routing, session, or tenancy changes;
- sponsor, payer, partner, KS, or AL exposure;
- billing, payment, Paddle, fee math, notifications, live AI, generated Wiki,
  Brain tooling, README, AGENTS, or architecture docs.

## Next Concrete Action

Produce the missing repo-safe authority packet for the nearest candidate:
`MOB-03a` non-medical, car/property-only vault + consent display foundation.

That packet must include:

1. named privacy/legal owner with role, date, and evidence reference;
2. explicit medical/injury disabled boundary or signed/accepted DPIA/Art. 9
   authority;
3. accepted consent-record fields and source of authority, without implying
   migration/runtime authority;
4. access-role and document-boundary proof;
5. threat-model recheck for document access, revocation, sponsor/payer
   visibility, erased rendering, and audit trail;
6. erased/revoked subject rendering proof;
7. exact runtime exclusions and stop conditions.

Only after those are complete should a replacement `MOB-DG04` or `MOB-DG04b`
authority PR consider promoting exactly one concrete implementation slice.
