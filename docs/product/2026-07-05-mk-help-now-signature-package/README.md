---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-03-mobile-legal-compliance-input-templates.md
  - docs/product/2026-07-03-mob-dg01-help-now-trip-mode-gate-packet.md
  - docs/product/2026-07-03-artifact-pdf-template-specs.md
  - docs/product/2026-07-06-mk-reviewer-appointment-intake.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
---

# MK Help Now Signature Package

> Status: signature package only. This appoints nobody, approves no country
> facts, and authorizes no public exposure. North Macedonia / Makedonia (`MK`)
> can move from dark content to launchable content only after the required
> named professionals complete, date, cite, and sign the forms in this package.

Purpose: give Interdomestik a practical PDF packet that real North Macedonia
professionals can sign now: local counsel, traffic/insurance practice reviewer,
language reviewer, and Interdomestik release owner.

First intake check: use
`docs/product/2026-07-06-mk-reviewer-appointment-intake.md` to decide which rows
the named reviewer can close and which rows need counsel countersign. Gazmend is
currently only a working MK reviewer candidate until that intake and document 01
are signed.

Reviewer-facing return instructions are in
`docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md`.

## Package Documents

1. `01-reviewer-appointment-and-scope.md` / PDF
   - Names the reviewer(s), qualification, independence, countersign path, and
     accepted scope. Its returned fields must also pass
     `docs/product/2026-07-06-mk-reviewer-appointment-intake.md`.
2. `02-source-verification-workbook.md` / PDF
   - Captures dated sources for emergency numbers, police/EAS rules, insurance,
     deadlines, privacy, and UPL-safe phrasing.
3. `03-content-signoff-matrix.md` / PDF
   - Row-by-row L2 sign-off table for the MK Help Now content pack.
4. `04-language-and-eas-certificate.md` / PDF
   - Native Macedonian, Albanian, and corridor German/EAS wording review.
5. `05-operational-release-hold.md` / PDF
   - Confirms hotfix owner, alert owner, validity window, and freeze rules.
6. `06-final-pack-completion-certificate.md` / PDF
   - Final go/no-go certificate binding all signatures to pack version/hash.

## Rules

- No unsigned row ships.
- Memory-only validation is not sufficient.
- Every factual row needs source/citation and retrieval date.
- Legal/factual review and language review may be different people.
- If the primary reviewer is not licensed North Macedonia counsel, a counsel
  countersign path must be recorded.
- The package signs facts and wording only. Runtime `MOB-01b` still requires
  current authority and design-gate approval before exposure.

## PDF Output

Generated PDFs belong under:

`output/pdf/2026-07-05-mk-help-now-signature-package/`

## Completion Rule

The MK package is complete only when:

- the reviewer appointment intake is accepted;
- any reviewer return is accepted or corrected through the Albanian return
  packet;
- all six documents are filled;
- required professionals have signed;
- source links/citations and retrieval dates are present;
- pack version/hash is recorded;
- validity date is recorded;
- the final completion certificate says `GO`;
- repo authority later promotes the runtime exposure slice.
