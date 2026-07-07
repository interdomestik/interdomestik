---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-06
related:
  - docs/product/2026-07-05-mk-help-now-signature-package/README.md
  - docs/product/2026-07-05-mk-help-now-signature-package/01-reviewer-appointment-and-scope.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
---

# MK Reviewer Appointment Intake

> Status: appointment intake only. This appoints nobody, approves no country
> facts, signs no content row, and authorizes no runtime exposure. It exists so
> returned reviewer evidence can be accepted or rejected consistently before
> `ENT-A04` is marked done.

Country pack: North Macedonia / Makedonia (`MK`)

Reviewer-facing return instructions are in
`docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md`. Use that packet
when Gazmend or another reviewer needs to know exactly what to return and how
Interdomestik will accept the evidence.

## Current State

| Field                            | Current value                                                      |
| -------------------------------- | ------------------------------------------------------------------ |
| Working reviewer candidate       | Gazmend                                                            |
| Known role                       | CEO, Ops, and UI/UX for Interdomestik MK                           |
| Known coverage                   | MK operating context, product wording, user trust, local usability |
| Licensed North Macedonia counsel | TBD                                                                |
| Legal/factual L2 signer          | TBD unless Gazmend provides licensed-counsel qualification         |
| Scope accepted                   | Not signed                                                         |
| Pack version/hash                | TBD                                                                |
| Appointment status               | Not complete                                                       |
| `ENT-A04` result                 | Blocked until this intake and the signature package pass           |

Gazmend can be accepted as the MK operating and UI/UX reviewer for rows that his
role can honestly cover. He can also contribute local-language and user-trust
feedback. If he is not licensed North Macedonia counsel, legal/factual rows
still need a named counsel countersign path before `ENT-A04` can pass.

## What The Reviewer Is Being Asked To Do

In Albanian for the reviewer:

Interdomestik ka nevoje ta vertetoje paketen `Help Now` per Maqedonine e Veriut
para se te shfaqet publikisht. Shqyrtuesi nuk po jep leje per launch. Ai vetem
konfirmon se informatat jane te sakta, burimet jane te shenuara, tekstet jane te
kuptueshme per perdoruesin, dhe cdo pasiguri eshte shenuar si bllokim ose
korrigjim.

Te dhenat qe futen ketu perdoren si evidence per vendimin e ardhshem teknik.
Nese nje rresht mungon, eshte pa burim, pa date, ose pa nenshkrim te duhur, ai
rresht nuk mund te shfaqet ne platforme.

## Appointment Acceptance Fields

Fill these fields before accepting the reviewer appointment.

| Field                                | Required value                     |
| ------------------------------------ | ---------------------------------- |
| Reviewer name                        |                                    |
| Role / profession                    |                                    |
| Organization                         |                                    |
| Jurisdiction covered                 | North Macedonia / Makedonia (`MK`) |
| Qualification evidence or basis      |                                    |
| Licensed North Macedonia counsel?    | yes / no                           |
| If no, counsel countersign required? | yes / no                           |
| Counsel reviewer / countersigner     |                                    |
| Scope accepted?                      | yes / no                           |
| Appointment date                     |                                    |
| Signature or signed PDF reference    |                                    |
| Evidence storage path                |                                    |

Do not require email or phone unless the returned professional record already
includes it. The evidence record needs identity, role, qualification basis,
scope, date, and signature reference; it does not need direct-contact data.

## Coverage Matrix

Use this matrix to decide which rows Gazmend or another reviewer can close and
which rows require counsel.

| Review area                           | Why Interdomestik needs it                                                                            | Primary reviewer                                | Counsel countersign required?                             | Pass evidence                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Emergency numbers and routing caveats | Wrong numbers create direct roadside risk in `Help Now`.                                              | MK ops reviewer or counsel                      | Counsel if legal/official interpretation is involved      | Source, retrieval date, verified number, result, signature |
| Police versus EAS rules               | The app must not tell a driver to skip police when law or practice requires it.                       | Counsel preferred                               | Yes unless primary reviewer is licensed counsel           | Scenario rule, citation, result, signature                 |
| Green Card / border insurance         | Incorrect insurance guidance can harm claim recovery and trust.                                       | Counsel or insurance-practice reviewer          | Yes if legal status or liability interpretation is stated | Verified status, citation, date, result, signature         |
| Evidence checklist                    | The app needs practical steps without collecting unsafe private data.                                 | MK ops reviewer plus counsel for legal boundary | Yes for legal-advice boundary                             | Reviewed checklist, privacy check, correction status       |
| Roadside do/don't wording             | Stress-state wording must be locally safe and not too aggressive.                                     | MK ops/UIUX reviewer                            | Yes if legal duty/admission wording is interpreted        | Wording review, corrections, result                        |
| Deadlines and claims caveats          | Deadline claims must avoid overpromising final legal advice.                                          | Counsel                                         | Yes                                                       | Citation, safe phrasing, expiry, signature                 |
| Bilingual EAS meaning equivalence     | Albanian/German/Macedonian variants must not change meaning.                                          | Language reviewer                               | Counsel if legal/factual meaning changes                  | Sentence-level differences, disposition                    |
| Native Albanian readability           | MK Albanian users must understand the roadside guidance quickly.                                      | Native Albanian reviewer                        | No unless legal meaning changes                           | Naturalness notes and corrections                          |
| Product trust and UI clarity          | The reviewer must understand what the user sees and whether it feels broken, misleading, or too slow. | Gazmend or UI/UX reviewer                       | No                                                        | Screen/frame feedback and disposition                      |
| Final pack hash/version binding       | Signatures must bind to one frozen pack, not future edited text.                                      | Release owner plus primary reviewer             | Counsel if legal rows changed after signature             | Hash, date, final certificate                              |

## Acceptance Rule

`ENT-A04` can be marked complete only when all of the following are true:

1. `01-reviewer-appointment-and-scope.md` is filled, dated, and signed.
2. This intake records the reviewer role, qualification basis, scope, date, and
   evidence path.
3. The source workbook contains source/citation and retrieval date for every
   non-blocked factual/legal row.
4. The content sign-off matrix has no unsigned `pass` row and no unresolved
   `block` row.
5. The language/EAS certificate covers every language that will ship.
6. If the primary reviewer is not licensed North Macedonia counsel, counsel
   countersign is recorded for legal/factual rows before the final certificate.
7. `05-operational-release-hold.md` confirms B6/B7-style operational holds are
   not being ignored.
8. `06-final-pack-completion-certificate.md` binds the completed package to a
   pack version/hash and says `GO`.

Reviewer-portal input, chat confirmation, or an unsigned document can support
intake, but cannot close `ENT-A04` by itself.

## Safe Evidence Rules

- Do not store private identity documents in the repo.
- Do not store phone numbers, personal email addresses, private channel names,
  or raw claim/user identifiers unless they are already part of a signed public
  professional document and are necessary for evidence.
- Store signed PDFs or redacted scans under the approved evidence location, then
  reference the file path here.
- If a correction arrives after one month, reopen the affected row, record the
  new source/date, re-hash the pack if text changes, and re-sign only the
  affected rows plus the final certificate.

## Current Verdict

This intake template was originally written while `ENT-A04` was blocked. The
2026-07-07 return from Gazmend supersedes that dispatch-only state for
current-authority review. Treat `ENT-A04` as accepted only through the dated
intake row in
`docs/reviews/2026-07-06-nine-step-evidence-intake-register-part-02.md`; reopen
it if signature status, counsel/factual scope, source citations, or evidence
dates are later disputed.
