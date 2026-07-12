---
plan_role: input
status: active
source_of_truth: false
owner: product
last_reviewed: 2026-07-11
related:
  - docs/product/2026-07-09-mob-03a-authority-evidence-request.md
  - docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md
---

# MOB-03a Authority And Jurisdiction Attestation

> Status: accepted factual intake. Sanja Jovanovska confirmed the MK Legal /
> Privacy boundary, and Gazmend Abazi confirmed his independent disposition on
> 2026-07-12. This document is not a DPIA or runtime authority.

## Recorded Roles

| Actor / authority | Recorded role for this gate                | Jurisdiction / boundary                                    |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Sanja Jovanovska  | Legal / Privacy Authority                  | Interdomestik MK                                           |
| Gazmend Abazi     | Independent Business / Governance Reviewer | `MOB-03a` business/governance disposition                  |
| Fiona Abazi       | Executive / Business Owner                 | Interdomestik MK                                           |
| Arben Lila        | Platform Technical Guardian / consulted    | Technical boundaries; Kosovo remains outside this MK slice |
| `CA+DG`           | Current Authority + Design Gate            | Sole runtime implementation authority                      |

## Source And Date

These facts and assignments were supplied explicitly in the governing Codex task
on 2026-07-11. On 2026-07-12, the same task recorded that Sanja Jovanovska had
confirmed the Legal / Privacy boundary and that Gazmend Abazi had personally
checked and approved both reviewer receipts.

## Scope Effect

The proposed `MOB-03a` boundary remains non-medical, car/property-only, and
Interdomestik MK-only. Kosovo and Albania exposure remains excluded. The role
record does not authorize medical/injury data, external-party document access,
schema/RLS changes, or runtime implementation. Arben Lila is consulted for
platform boundaries but is not the tenant's legal or business approver.

## Required Independent Disposition

Gazmend Abazi recorded the required decisions through the Part A and Part B
reviewer receipts accepted in
`docs/product/2026-07-12-mob-03a-reviewer-receipt-acceptance.md`. Runtime work
still requires a separate canonical `CA+DG` that promotes exactly one slice.
