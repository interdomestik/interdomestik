---
plan_role: input
status: draft
source_of_truth: false
owner: product
last_reviewed: 2026-07-09
related:
  - docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md
  - docs/product/2026-07-03-mobile-program-authority-packet-part-2.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
---

# MOB-03a Authority Evidence Request

> Status: repo-safe evidence request for a possible future `MOB-DG04b`
> promotion. This document does not promote runtime work.

## Candidate

`MOB-03a` - non-medical, car/property-only Vault + Consent display foundation.

This candidate is intentionally narrower than the `MOB-03` umbrella. It must
not include medical/injury data, claim writers, Agreement Ceremony, POA/e-sign
runtime, billing, schema/RLS/migrations, auth/proxy/routing/session/tenancy, or
sponsor/payer/partner document sharing.

## Review Packet

Complete both repo-safe forms before drafting any `MOB-DG04b`
current-authority/design-gate PR:

- [Part A - owner, medical boundary, consent, access](2026-07-09-mob-03a-authority-evidence-request-part-a.md)
- [Part B - document boundary, threat recheck, erasure, scope](2026-07-09-mob-03a-authority-evidence-request-part-b.md)

## Completion Rule

This request is complete only when every section in Part A and Part B has a
reviewer decision, date, named owner/reviewer where applicable, and evidence
reference. After completion, a separate `MOB-DG04b`
current-authority/design-gate PR may decide whether exactly one implementation
slice is promoted.
