---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-04
related:
  - docs/product/2026-07-03-artifact-pdf-template-specs.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
  - docs/product/2026-07-03-mobile-error-taxonomy.md
  - docs/product/2026-07-03-mob-execution-sequence.md
---

# Fable Evidence Custody Specification

> Status: **Fable 5 advisory input only - no execution authority.** This document
> authorizes no runtime work, no slice promotion, and no changes to routing,
> auth, session, tenancy, proxy, schema, billing, VONESA, SVC, or CQRS. Any future
> implementation implication must be separately promoted through current
> authority. Paddle-only billing remains fixed.

## Purpose

Enterprise trust for Interdomestik depends on whether evidence can be explained
to members, branch staff, lawyers, insurers, sponsors, and auditors without
over-claiming. This spec gives future gates a shared custody vocabulary. It is a
contract-input document, not a data model, event model, or migration proposal.

## Principles

1. **Member custody by default:** before explicit handoff, local incident bundles
   remain member-controlled. Do not imply Interdomestik possesses evidence it has
   not received.
2. **Declaration before possession:** a Claim Pack may list member-declared
   evidence before upload, but must label it as declared, not held.
3. **Integrity without theatrics:** use reference numbers, timestamps, versions,
   and manifests. Do not claim notarization, forensic proof, or court-grade
   custody unless counsel approves the exact claim.
4. **Multilingual dignity:** custody wording must work in sq/de/en/mk without
   sounding evasive, bureaucratic, or like insurance small print.
5. **Sponsors see aggregates only:** sponsor credibility never depends on access
   to member evidence or case-level facts.

## Custody State Vocabulary

| State                | Meaning                                                     | Permitted wording                |
| -------------------- | ----------------------------------------------------------- | -------------------------------- |
| `member_device`      | Evidence exists only on the member device.                  | "Saved on this phone."           |
| `declared`           | The member has listed an item in a pack or form.            | "Declared by the member."        |
| `submitted_vault`    | Evidence was explicitly sent into Interdomestik custody.    | "Received by Interdomestik."     |
| `review_pending`     | A human review is required but not complete.                | "Waiting for review."            |
| `reviewed`           | A qualified reviewer has checked usability or completeness. | "Reviewed on {date}."            |
| `sealed_manifest`    | Manifest and versions are fixed for a disclosure packet.    | "Packet version fixed."          |
| `disclosed`          | Shared with a named counterparty.                           | "Sent to {party} on {date}."     |
| `retained`           | Held after active use under a retention rule.               | "Kept under the retention rule." |
| `erasure_pending`    | Deletion/destruction requested or scheduled.                | "Deletion requested."            |
| `crypto_shredded`    | Digital erasure completed through the approved chain.       | "Digital deletion completed."    |
| `physical_destroyed` | Paper original or copy destroyed under policy.              | "Physical destruction recorded." |

All retention periods and destruction procedures are **UNVERIFIED** until the
data and consent map plus counsel review set them.

## Transition Rules

1. `member_device` -> `declared`: allowed without account if the pack clearly
   states the content is member-provided and locally held.
2. `declared` -> `submitted_vault`: requires explicit handoff. No silent upload,
   retry, or background sync for evidence.
3. `submitted_vault` -> `review_pending` -> `reviewed`: reviewer identity,
   role, timestamp, and reviewed artifact version must be recorded by the future
   implementation slice.
4. `reviewed` -> `sealed_manifest`: only after the artifact reference, pack
   version, legal marker version, and included items are fixed.
5. `sealed_manifest` -> `disclosed`: disclose only to a named party for a named
   purpose. Sponsors are excluded.
6. `retained` -> `erasure_pending` -> `crypto_shredded` or
   `physical_destroyed`: depends on **UNVERIFIED** retention and legal-hold
   rules.

## Actor Matrix

| Actor                    | May do                                                         | Must not do                                               |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| Member                   | Create, declare, delete local bundle; initiate handoff.        | Be surprised by upload or disclosure.                     |
| Branch staff             | Scan paper, issue intake receipt, return originals by default. | Hold originals without a counsel-approved bailment rule.  |
| Case team or handler     | Request review, prepare packets, communicate status.           | Claim legal review before it happened.                    |
| Legal reviewer           | Approve legal instruments and reviewed wording.                | Approve unverified jurisdiction facts silently.           |
| Medical reviewer         | Review medical evidence only after DPIA/consent path.          | Touch MOB-01 car/property evidence by default.            |
| Partner lawyer           | Receive scoped disclosed packets.                              | Browse vault contents.                                    |
| Insurer/recovery partner | Receive named disclosed artifacts.                             | Receive sponsor-level aggregate reports with case detail. |
| Sponsor                  | Receive aggregate, privacy-safe reporting only.                | Access member, case, evidence, or document-level data.    |
| Support                  | Use reference numbers to help the member.                      | View contents unless an authorized support path exists.   |
| DPO/compliance           | Audit custody, retention, and erasure evidence.                | Change case facts.                                        |

## Branch Handoff

Paper-to-digital branch intake needs a bilingual receipt before branch launch:

- proposed artifact type: `IDA-IR-{YYYYMMDD}-{shortid}` (design input only)
- list every received item, scan status, returned/held status, and staff name
- default: scan and return same visit
- exceptional holds: **blocked until counsel reviews bailment, liability, storage,
  and destruction rules**
- non-member family presenters: allowed only when the future gate defines proof
  of authority and member notification

## Contract Clauses For Counsel

All clauses are **COUNSEL-REVIEW REQUIRED**:

- C1: "Before you send evidence to us, it stays on your device."
- C2: "A Claim Pack may list evidence you told us about, even before we hold it."
- C3: "We record when a packet version is fixed and when it is disclosed."
- C4: "Sponsors cannot access individual cases or evidence."
- C5: "We do not call evidence notarized, forensic, or court-certified unless a
  separate approved process says so."
- C6: "Deletion can be limited by legal retention or legal hold duties."
- C7: "Physical paper handling follows the branch intake receipt."

## Future-Slice Mapping

| Future surface               | Mapping                                               |
| ---------------------------- | ----------------------------------------------------- |
| MOB-01 Help Now / Claim Pack | May use `member_device` and `declared`; no uploads.   |
| MOB-03 Vault / consent       | First likely `submitted_vault` and retention surface. |
| MOB-05b Agreement Ceremony   | Signature evidence and sealed signed packs.           |
| MOB-06 under OMG             | Branch intake receipt and branch custody workflow.    |
| WS-F / VONESA                | Own authority; may reuse disclosed packet vocabulary. |
| Sponsor reporting            | Legal/marketing input only until separately promoted. |

## Open Board Decisions

1. Is Interdomestik willing to hold original paper at branches?
2. Should destruction certificates be member-visible trust artifacts?
3. What exact sponsor visibility line is commercially usable and legally safe?
4. Which party owns liability for branch scanning failures?
5. Can branch launch precede OMG, or does custody make OMG a hard gate?
