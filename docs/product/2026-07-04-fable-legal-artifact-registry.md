---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-04
related:
  - docs/product/2026-07-03-artifact-pdf-template-specs.md
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
  - docs/product/2026-07-04-fable-evidence-custody-specification.md
---

# Fable Legal Artifact Registry

> Status: **Fable 5 advisory input only - no execution authority.** This registry
> is not a template library, schema, writer, or slice promotion. It names the
> legal and trust artifacts future gates may adopt after current authority
> permits them. Any legal character stated here is **UNVERIFIED** unless counsel
> signs the relevant L-input.

## Registry Rules

- Each artifact has one purpose, one reference identity, and one owning review
  lane.
- Blank fields are not allowed in filed artifacts; use "not provided" as already
  specified in the PDF template spec.
- Member-facing PDFs must survive print, grayscale, forwarding, and lawyer use.
- Legal instruments and marker translations are documents, not casual message
  keys.
- Generated artifacts may be regenerated idempotently, but identity must not
  multiply on retry.

## Artifact Registry

| ID     | Artifact                         | Legal character                               | Custody states                          | Review lane          | Future mapping      |
| ------ | -------------------------------- | --------------------------------------------- | --------------------------------------- | -------------------- | ------------------- |
| LAR-01 | Claim Pack PDF `IDA-CP-*`        | Starting file, not legal advice               | `declared`, later `sealed_manifest`     | L2/L5 copy markers   | MOB-01              |
| LAR-02 | Bilingual EAS PDF `IDA-EAS-*`    | Form companion, official semantics UNVERIFIED | `member_device`                         | L2 country sign-off  | MOB-01              |
| LAR-03 | Signed Pack PDF `IDA-SP-*`       | Signed-document bundle                        | `sealed_manifest`, `disclosed`          | L1/L5                | MOB-05b             |
| LAR-04 | Evidence Manifest annex          | Evidence list, not possession proof           | `declared` or `submitted_vault`         | custody + L5 wording | MOB-01/MOB-03       |
| LAR-05 | Signature Evidence block         | Method/timestamp/version record               | `reviewed`, `sealed_manifest`           | L1                   | MOB-05b             |
| LAR-06 | Consent Record                   | Data-processing proof                         | `submitted_vault`, `retained`           | L3/L5                | MOB-03              |
| LAR-07 | Power of Attorney                | Legal instrument, UNVERIFIED by country       | `sealed_manifest`                       | L1                   | MOB-05b             |
| LAR-08 | Assignment / cession             | Legal instrument, UNVERIFIED by country       | `sealed_manifest`                       | L4/L5                | WS-F only           |
| LAR-09 | Fee Disclosure                   | Commercial/consumer information               | `reviewed`, `sealed_manifest`           | L5                   | MOB-05a/MOB-05b     |
| LAR-10 | Demand Letter                    | Recovery document                             | `sealed_manifest`, `disclosed`          | counsel              | Future case ops     |
| LAR-11 | Settlement Confirmation          | Recovery closing document                     | `sealed_manifest`, `retained`           | counsel/finance      | Future case ops     |
| LAR-12 | Branch Intake Receipt `IDA-IR-*` | Proposed custody receipt                      | `submitted_vault`, `retained`           | counsel + ops        | MOB-06 under OMG    |
| LAR-13 | Custody Record                   | Internal audit record                         | all post-handoff states                 | compliance           | Future runtime only |
| LAR-14 | Erasure/Destruction Record       | Deletion/destruction evidence                 | `crypto_shredded`, `physical_destroyed` | DPO/counsel          | Future privacy work |
| LAR-15 | Sponsor Credibility Pack         | Aggregate proof only                          | no member custody state                 | legal/marketing      | Input only          |
| LAR-16 | Legal Input Matrix L1-L7         | Counsel evidence artifacts                    | `retained`                              | legal/compliance     | Input only          |
| LAR-17 | Business Decision Memos          | Board/product decisions                       | `retained`                              | product/legal        | Input only          |
| LAR-18 | Partner Release Terms            | Disclosure conditions                         | `disclosed`                             | counsel              | Future partner path |

## Counsel Review Queue

1. **CRQ-1:** custody limitation sentence for Claim Pack and local bundle.
2. **CRQ-2:** POA/e-sign matrix by country and diaspora jurisdiction.
3. **CRQ-3:** fee promise including expert-cost-on-loss treatment.
4. **CRQ-4:** service-authorization / claims-management licensing matrix.
5. **CRQ-5:** membership regulatory classification.
6. **CRQ-6:** sponsor visibility and aggregate-report wording.
7. **CRQ-7:** branch paper holding, bailment, and liability position.
8. **CRQ-8:** retention, erasure, legal hold, and physical destruction.
9. **CRQ-9:** official EAS, Green Card, and country content terms.

CRQ-2 and CRQ-9 do not replace existing L1/L2 long poles; they make the same
work visible inside the artifact system.

## Entry Criteria Suggestions

| Future gate        | Suggested artifact entry criteria                          |
| ------------------ | ---------------------------------------------------------- |
| MOB-DG01           | LAR-01/LAR-02 designs plus CRQ-1/CRQ-9 for public wording. |
| MOB-DG02 / MOB-05a | CRQ-3 and fee disclosure wording before money surfaces.    |
| MOB-DG03 / MOB-03  | LAR-06 plus retention and consent answers before uploads.  |
| MOB-DG05 / MOB-05b | LAR-03/LAR-05/LAR-07 plus L1 country matrix.               |
| OMG branch work    | LAR-12 and CRQ-7 before branch evidence intake.            |

## Registry Red Flags

- Do not let a PDF template imply counsel sign-off before counsel signs.
- Do not let Claim Pack evidence lists imply Interdomestik holds local photos.
- Do not create sponsor proof by weakening sponsor privacy boundaries.
- Do not mix WS-F cession artifacts into MOB authority.
- Do not treat proposed artifacts (`IDA-IR-*`, custody record, destruction
  record) as implementation scope without a future gate.
