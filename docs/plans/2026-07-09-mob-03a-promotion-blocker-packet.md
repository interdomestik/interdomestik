---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-09
related:
  - docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md
  - docs/product/2026-07-09-mob-03a-authority-evidence-request.md
  - docs/product/2026-07-09-mob-03a-authority-evidence-request-part-a.md
  - docs/product/2026-07-09-mob-03a-authority-evidence-request-part-b.md
  - docs/product/2026-07-03-mobile-program-authority-packet-part-2.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
---

# MOB-03a Promotion Blocker Packet

> Status: blocker packet after `MOB-DG04`. This document does not promote
> runtime work.

## Verdict

`MOB-03a` is the nearest next candidate, but it is not ready to promote.

Reason: the latest reviewer portal corrections confirm the requirements for
the next gate, but they do not provide the repo-safe authority facts required to
authorize implementation.

Expected resolver state remains:

```text
status: blocked_requires_current_authority
activeSlice: null
```

## Candidate

`MOB-03a` - non-medical, car/property-only Vault + Consent display foundation.

This is narrower than the `MOB-03` umbrella and excludes medical/injury data
unless a signed/accepted DPIA / Art. 9 authority later exists.

## Evidence Table

| Requirement                  | Status  | Current evidence                                                                                                                                           | Blocker                                                                                                                      |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Exactly one candidate        | Partial | `MOB-DG04` identifies `MOB-03a` as nearest candidate.                                                                                                      | Candidate is not promotable until entry evidence is complete.                                                                |
| Privacy/legal owner          | Missing | Reviewer item `M03-DPIA-OWNER` says not to accept without owner name, role, date, and evidence reference.                                                  | No repo-safe privacy/legal owner fact is recorded.                                                                           |
| Medical/injury boundary      | Partial | Reviewer item `M03-NO-MEDICAL-FALLBACK` allows car/property-only planning; `M03-ART9-SCOPE` blocks medical/injury without DPIA.                            | Need explicit signed decision that `MOB-03a` excludes medical/injury, or signed/accepted DPIA / Art. 9 authority.            |
| Consent-record fields        | Partial | Reviewer item `M03-CONSENT-RECORD` lists minimum fields.                                                                                                   | Need accepted repo-safe authority for those fields and confirmation it is not migration/runtime authority.                   |
| Access roles                 | Partial | Reviewer item `M03-ACCESS-ROLES` limits access to member and authorized internal case-scoped roles.                                                        | Need consolidated access boundary proof for the future display surface.                                                      |
| Document boundary            | Partial | Reviewer item `M03-DOCUMENT-BOUNDARY` forbids raw IDs, private legal docs, medical docs, payment data, and staff-private notes without separate authority. | Need exact allowed display data for `MOB-03a`.                                                                               |
| Threat recheck               | Missing | Reviewer item `M03-THREAT-RECHECK` requires recheck.                                                                                                       | Need evidence reference for document access, revocation, sponsor/payer visibility, erased rendering, and audit trail review. |
| Erasure/revocation rendering | Missing | Reviewer item `M03-ERASURE-AUDIT` requires skeleton-preserving, subject-hiding proof.                                                                      | Need proof rule accepted for the future display surface.                                                                     |
| Exact scope / exclusions     | Partial | `MOB-DG04` records high-level exclusions.                                                                                                                  | Need accepted `MOB-03a` exact scope and stop conditions before promotion.                                                    |

## Required Next Action

Complete `docs/product/2026-07-09-mob-03a-authority-evidence-request.md`
and both linked Part A / Part B forms.

After it is complete, draft a new `MOB-DG04b` authority/design-gate PR. That PR
may promote exactly one slice only if every blocker above is closed with
repo-safe evidence.

## Non-Goals

This blocker packet does not authorize:

- full `MOB-03`;
- medical or injury data;
- claim writers, status mutation, or outbox writes;
- Agreement Ceremony, ProposalCard approval, POA/e-sign runtime, or billing;
- schema/RLS/migrations;
- auth, proxy, routing, session, or tenancy changes;
- sponsor, payer, partner, KS, or AL exposure;
- generated Wiki, Brain tooling, README, AGENTS, or architecture docs.
