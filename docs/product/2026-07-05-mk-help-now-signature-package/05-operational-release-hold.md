---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
---

# 05 - MK Operational Release Hold

> Status: operational-readiness template only. It records release holds and
> owners; it does not promote or expose runtime content.

Country pack: North Macedonia / Makedonia (`MK`)

> This document records operational controls that must exist before a signed MK
> pack can be exposed. It does not promote runtime work and does not flip any
> feature flag.

Pack version/hash:

Release owner:

Date:

## A. Required Operational Owners

| Control                               | Named owner | Evidence path / system | Ready?   |
| ------------------------------------- | ----------- | ---------------------- | -------- |
| Content hotfix owner                  |             |                        | yes / no |
| Emergency-number hotfix path          |             |                        | yes / no |
| Insurance/Green Card hotfix path      |             |                        | yes / no |
| Help Now alert owner                  |             |                        | yes / no |
| Service-worker/cache alert owner      |             |                        | yes / no |
| Country-pack rollback/re-darken owner |             |                        | yes / no |
| User-support escalation owner         |             |                        | yes / no |

## B. Release Holds

The MK pack remains dark if any answer is yes.

| Hold condition                                    | Yes/No | Notes |
| ------------------------------------------------- | ------ | ----- |
| Any L2 sign-off row missing or blocked            |        |       |
| Any source older than accepted validity window    |        |       |
| Emergency number changed after signature          |        |       |
| Insurance / Green Card guidance uncertain         |        |       |
| Language certificate missing for shipped language |        |       |
| Hotfix path untested                              |        |       |
| Alert path untested                               |        |       |
| Current authority/design gate not granted         |        |       |

## C. Validity And Hotfix Triggers

Pack valid until:

Maximum validity: 12 months unless counsel sets shorter period.

Out-of-cycle hotfix required when:

- emergency number or routing changes;
- police/EAS rule changes;
- Green Card, border-insurance, or foreign-plate practice changes;
- legal deadline or insurer process changes;
- language error could mislead a roadside user;
- Interdomestik support detects user confusion or incident-risk copy.

## D. Release Owner Attestation

I confirm that this document records operational readiness only. It does not
authorize runtime exposure without repo current authority/design gate.

Release owner signature:

Printed name:

Role:

Date:
