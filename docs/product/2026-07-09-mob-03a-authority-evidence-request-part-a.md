---
plan_role: input
status: draft
source_of_truth: false
owner: product
last_reviewed: 2026-07-09
related:
  - docs/product/2026-07-09-mob-03a-authority-evidence-request.md
---

# MOB-03a Evidence Request Part A

> Status: repo-safe review form. This document does not promote runtime work.

## 1. Privacy / Legal Owner

Kjo duhet te plotesohet nga personi qe mban pergjegjesine privacy/legal per
scope-in `MOB-03a`.

| Field              | Answer |
| ------------------ | ------ |
| Owner name         |        |
| Owner role         |        |
| Decision date      |        |
| Evidence reference |        |
| Reviewer name      |        |
| Reviewer role      |        |

Decision:

- [ ] Approve for `MOB-03a` non-medical planning only.
- [ ] Request change.
- [ ] Block.

Reason / notes:

```text

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
| Decision date                                 |                                                      |
| Reviewer                                      |                                                      |

Decision:

- [ ] Approve non-medical boundary.
- [ ] Request change.
- [ ] Block.

Reason / notes:

```text

```

## 3. Consent Record Fields

Recommended decision: accept these fields as the minimum authority requirement,
but do not treat this as migration/runtime authority.

Required fields: `consentType`, `subject`, `scope`, `grantedBy`, `grantedAt`,
`revokedAt`, `evidenceRef`, `retentionOrErasureRule`, `reviewer`.

Decision:

- [ ] Approve as `MOB-03a` evidence requirement only.
- [ ] Request change.
- [ ] Block.

Additional required fields or exclusions:

```text

```

Reason / notes:

```text

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

```
