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

# MOB-03a Owner And Jurisdiction Attestation

> Status: factual intake for independent review. This document is not a signed
> legal decision, DPIA, reviewer disposition, or runtime authority.

## Recorded Roles

| Person        | Recorded role for this gate                          | Jurisdiction / boundary                                     |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Gazmend Abazi | Privacy / Legal Owner for `MOB-03a`                  | Interdomestik MK                                            |
| Fiona Abazi   | CEO, Interdomestik MK                                | North Macedonia                                             |
| Arben Lila    | Independent reviewer; responsible contact for Kosovo | Reviews MK gate; Kosovo remains excluded from runtime scope |

## Source And Date

These facts and the reviewer assignment were supplied explicitly by Arben Lila
in the governing Codex task on 2026-07-11. The recorded assignment is not a
completed disposition; Arben Lila must still confirm or correct the packet and
record decisions before any promotion decision relies on it.

## Scope Effect

The proposed `MOB-03a` boundary remains non-medical, car/property-only, and
Interdomestik MK-only. Kosovo and Albania exposure remains excluded. The role
record does not authorize medical/injury data, external-party document access,
schema/RLS changes, or runtime implementation.

## Required Independent Disposition

The reviewer must record name, role, date, decision, notes, and evidence
references in both authority evidence forms. Until then, the canonical resolver
must remain `blocked_requires_current_authority` with no active slice.
