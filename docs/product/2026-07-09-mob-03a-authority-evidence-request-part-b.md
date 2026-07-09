---
plan_role: input
status: draft
source_of_truth: false
owner: product
last_reviewed: 2026-07-09
related:
  - docs/product/2026-07-09-mob-03a-authority-evidence-request.md
---

# MOB-03a Evidence Request Part B

> Status: repo-safe review form. This document does not promote runtime work.

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

```

Explicitly forbidden display data:

```text
Raw IDs; private legal docs; medical docs; payment data; staff-private notes;
document links without separate authority.
```

Reason / notes:

```text

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

```

Reason / notes:

```text

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

```

## 8. Exact Runtime Scope And Stop Conditions

Recommended decision: if promoted later, `MOB-03a` should be display foundation
only. Stop if implementation needs any excluded protected surface.

Allowed scope:

```text
Non-medical, car/property-only Vault + Consent display foundation.
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

```
