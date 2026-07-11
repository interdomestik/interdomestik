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

> Status: factual intake for independent review. This document is not a signed
> legal decision, DPIA, reviewer disposition, or runtime authority.

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
on 2026-07-11. The recorded roles are not a completed disposition. Sanja
Jovanovska must confirm the Legal / Privacy boundary and Gazmend Abazi must
record the independent Business / Governance decisions.

## Scope Effect

The proposed `MOB-03a` boundary remains non-medical, car/property-only, and
Interdomestik MK-only. Kosovo and Albania exposure remains excluded. The role
record does not authorize medical/injury data, external-party document access,
schema/RLS changes, or runtime implementation. Arben Lila is consulted for
platform boundaries but is not the tenant's legal or business approver.

## Required Independent Disposition

Gazmend Abazi must record date, decision, notes, and evidence references in both
forms after Sanja Jovanovska confirms the Legal / Privacy boundary. Runtime work
still requires a separate canonical `CA+DG`; until that gate promotes exactly
one slice, the resolver remains `blocked_requires_current_authority`.
