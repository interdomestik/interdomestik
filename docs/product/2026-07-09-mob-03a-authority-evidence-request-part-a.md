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

# MOB-03a Evidence Request Part A

> Status: repo-safe review form. This document does not promote runtime work.

## 1. Legal / Privacy Authority And Governance Reviewer

Kjo duhet te plotesohet nga personi qe mban pergjegjesine privacy/legal per
scope-in `MOB-03a`.

| Field              | Answer                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Owner name         | Sanja Jovanovska                                                    |
| Owner role         | Legal / Privacy Authority, Interdomestik MK                         |
| Decision date      | Pending independent reviewer disposition                            |
| Evidence reference | `docs/product/2026-07-11-mob-03a-owner-jurisdiction-attestation.md` |
| Reviewer name      | Gazmend Abazi                                                       |
| Reviewer role      | Independent Business / Governance Reviewer                          |
| Executive owner    | Fiona Abazi — Executive / Business Owner                            |
| Technical guardian | Arben Lila — Platform Technical Guardian / consulted                |
| Runtime authority  | `CA+DG` — Current Authority + Design Gate                           |

Decision:

- [ ] Approve for `MOB-03a` non-medical planning only.
- [ ] Request change.
- [ ] Block.

Reason / notes:

```text
Recommended default: confirm the separated MK role model. This does not replace
Sanja's Legal / Privacy confirmation, Gazmend's reviewer disposition, or `CA+DG`.
```

## 2. Medical / Injury Boundary

Recommended decision: approve only the non-medical boundary now. Medical and
injury data should stay disabled until a signed/accepted DPIA / Art. 9 authority
exists.

| Field                                         | Answer                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| Is medical/injury data allowed in this slice? | No                                                   |
| If yes, DPIA / Art. 9 evidence reference      |                                                      |
| If no, disabled-scope statement               | Medical and injury data are excluded from `MOB-03a`. |
| Decision date                                 | Pending independent reviewer disposition             |
| Legal / Privacy authority                     | Sanja Jovanovska                                     |
| Business / Governance reviewer                | Gazmend Abazi                                        |

Decision:

- [ ] Approve non-medical boundary.
- [ ] Request change.
- [ ] Block.

Reason / notes:

```text
Recommended default: approve the non-medical boundary. Stop and return to a
new privacy/legal gate if medical or injury data enters scope.
```

## 3. Consent Record Fields

Recommended decision: accept these fields as the minimum authority requirement,
but do not treat this as migration/runtime authority.

Required authority fields: `consentType`, `subject`, `scope`, `grantedBy`,
`grantedAt`, `revokedAt`, `evidenceRef`, `retentionOrErasureRule`, `reviewer`.

Recommended display fields for this narrow slice: consent `status`,
`recordedAt`, and `version`. Raw consent evidence and personal data remain
outside the display boundary.

Decision:

- [ ] Approve as `MOB-03a` evidence requirement only.
- [ ] Request change.
- [ ] Block.

Additional required fields or exclusions:

```text
Recommended default: exclude raw/source consent fields, identity data,
document contents, signatures, and free-text personal data from the display.
```

Reason / notes:

```text
Recommended default: approve these as evidence requirements only. This is not
schema, migration, RLS, or runtime authority.
```

## 4. Access Roles

Recommended decision: allow member and authorized internal roles by case scope
only. Sponsor, payer, partner, and external parties must have no document
visibility without explicit consent authority.

| Role                     | Allowed for `MOB-03a`? | Notes                                |
| ------------------------ | ---------------------- | ------------------------------------ |
| Member                   | Yes                    | Own case only.                       |
| Authorized internal role | Yes                    | Case-scoped only.                    |
| Sponsor                  | No by default          | Requires separate consent authority. |
| Payer                    | No by default          | Requires separate consent authority. |
| Partner / external party | No by default          | Requires separate consent authority. |

Decision:

- [ ] Approve.
- [ ] Request change.
- [ ] Block.

Reason / notes:

```text
Recommended default: approve member access to the member's own case and
case-scoped access for authorized internal roles. Exclude all external parties;
escalate any requested external visibility to a separate consent authority.
```
