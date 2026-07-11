---
plan_role: input
status: active
source_of_truth: false
owner: product
last_reviewed: 2026-07-11
related:
  - docs/product/2026-07-09-mob-03a-authority-evidence-request.md
  - docs/product/2026-07-11-mob-03a-owner-jurisdiction-attestation.md
---

# MOB-03a Evidence Request Part B

> Status: repo-safe review form. This document does not promote runtime work.

Assigned independent reviewer: Arben Lila. This reviewer assignment does not
authorize Kosovo exposure or change the Interdomestik MK-only boundary.

## 5. Document Boundary

Recommended decision: `MOB-03a` may display only safe document-state metadata
needed for a non-medical vault/consent foundation. It must not display raw IDs,
private legal documents, medical documents, payment data, staff-private notes,
or document links without separate authority.

Decision:

- [ ] Approve the boundary.
- [ ] Request change.
- [ ] Block.

Explicitly allowed display data:

```text
Document state; document category; last-updated timestamp. Values must be
non-sensitive and case-scoped.
```

Explicitly forbidden display data:

```text
Raw IDs; private legal docs; medical docs; payment data; staff-private notes;
document links without separate authority.
```

Reason / notes:

```text
Recommended default: approve this minimum-metadata boundary. Any document
content, link, identifier, or new category stops the slice for a new gate.
```

## 6. Threat Recheck

Recommended decision: require a targeted threat recheck before promotion, even
for non-medical scope, because this is member-facing document/consent behavior.

Threat areas: document access; consent revocation; sponsor/payer visibility;
erased-subject rendering; audit trail.

Decision:

- [ ] Approve with threat recheck required before runtime PR.
- [ ] Request change.
- [ ] Block.

Threat recheck evidence reference:

```text
Baseline inputs pending independent recheck:
- docs/plans/ent-tm03-authenticated-claim-evidence-uploads-threat-model-2026-06-06.md
- docs/plans/ent-tm04-document-signed-urls-and-downloads-threat-model-2026-06-06.md
- docs/plans/ent-tm05-share-packs-threat-model-2026-06-06.md
- docs/security/storage-access-baseline.md
```

Reason / notes:

```text
Recommended default: require an independent targeted recheck before runtime
promotion. The baseline references above do not by themselves complete it.
```

## 7. Erasure / Revocation Rendering

Recommended decision: preserve useful skeleton/context, but hide subject data
and document links when consent is revoked or the subject is erased.

Decision:

- [ ] Approve.
- [ ] Request change.
- [ ] Block.

Required rendering rule:

```text
Keep non-sensitive skeleton context. Hide subject data and document links for
revoked/erased subjects.
```

Reason / notes:

```text
Recommended default: approve the rendering rule as a design requirement. Cite
MOB-02a no-mutation proof where relevant, but do not claim a completed DSR
rehearsal or end-to-end erasure proof.
```

## 8. Exact Runtime Scope And Stop Conditions

Recommended decision: if promoted later, `MOB-03a` should be display foundation
only. Stop if implementation needs any excluded protected surface.

Allowed scope:

```text
Non-medical, car/property-only Vault + Consent display foundation.
Interdomestik MK only.
```

Forbidden scope:

```text
Full MOB-03; medical/injury data; claim writers; status mutation; outbox writes;
Agreement Ceremony; ProposalCard approval; POA/e-sign runtime; schema/RLS/
migrations; auth/proxy/routing/session/tenancy; billing/payment/Paddle; sponsor/
payer/partner document sharing; KS/AL exposure; generated Wiki; Brain tooling;
README; AGENTS; architecture docs.
```

Decision:

- [ ] Approve exact scope and stop conditions.
- [ ] Request change.
- [ ] Block.

Reason / notes:

```text
Recommended default: approve this exact MK-only scope. Stop on missing
authority, sensitive data, scope expansion, or any need to touch a forbidden
surface. Arben Lila's Kosovo responsibility does not authorize Kosovo exposure
in this slice.
```
