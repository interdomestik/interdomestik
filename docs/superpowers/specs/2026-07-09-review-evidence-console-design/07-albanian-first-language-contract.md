# Design Appendix 7: Albanian-First Language Contract

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Goal

The reviewer-facing console uses Albanian as its primary language. A reviewer can complete every task, warning, validation step, receipt action, and correction without relying on English prose.

## Supersession

This appendix supersedes reviewer-facing English literals in appendices 1–6. It does not change canonical IDs, receipt keys, enum values, hashes, paths, or evidence references.

## Document Language

- Set `<html lang="sq">` and use an Albanian document title.
- Translate headings, instructions, actions, statuses, field labels, required markers, errors, recovery copy, confirmation prompts, accessible names, and live-region announcements.
- Mark an English phrase with `lang="en"` only when it is a retained technical term.
- Keep the product name `Review & Evidence Console` and pair it with the Albanian subtitle `Konsola e shqyrtimit dhe evidencës`.

## Canonical And Display Boundaries

Keep these canonical values unchanged:

- item, packet, assignment, reviewer, receipt, and correction IDs;
- repository paths, evidence references, hashes, schema keys, and JSON keys;
- decision and structured-response enum values.

Show Albanian labels for every canonical enum. The control submits the raw value while the interface shows the Albanian label first and the raw value as secondary audit metadata. Example: `Përjashto` with code `excluded`.

Required display-label maps cover:

- decisions: `approve`, `change`, `block`;
- severity: `low`, `medium`, `high`;
- risk: `privacy`, `legal`, `compliance`, `access`, `security`, `scope`;
- every option in each `requiredResponses` descriptor.

## Fixture Display Copy

The fixture stores Albanian reviewer copy directly for:

- packet `title`, `scope`, and each `stopConditions` entry;
- item `prompt`, `need`, `repoImpact`, and `guidance`;
- descriptor `labelSq` and every option display label.

Canonical English IDs remain visible beside the Albanian copy. If an English source sentence is retained for audit, it uses a separate non-rendered source field; the Albanian display field remains required and validated.

The eight reviewer headings are:

- `Pronari i privatësisë — M03A-PRIVACY-OWNER`;
- `Kufiri i të dhënave mjekësore — M03A-MEDICAL-BOUNDARY`;
- `Fushat minimale të pëlqimit — M03A-CONSENT-FIELDS`;
- `Rolet me qasje — M03A-ACCESS-ROLES`;
- `Kufiri i dokumenteve — M03A-DOCUMENT-BOUNDARY`;
- `Rikontrolli i kërcënimeve — M03A-THREAT-RECHECK`;
- `Fshirja dhe revokimi — M03A-ERASURE-REVOCATION`;
- `Fusha dhe kushtet e ndalimit — M03A-SCOPE-STOPS`.

## Authority Disclaimer

Render the Albanian disclaimer as derived interface copy outside the canonical receipt payload:

> Kjo dëftesë regjistron vetëm evidencën lokale të shqyrtimit. Ajo nuk jep autoritet për implementim në Interdomestik.

The canonical receipt retains its existing disclaimer field and value for hash and import compatibility. Tests prove the localized display disclaimer cannot change canonical JSON or receipt identity.

## Receipt And Export

The on-screen receipt uses Albanian labels. Exported JSON retains canonical keys and enum values. Localization must not change canonicalization, receipt IDs, imports, or correction ancestry.

## Acceptance

- No reviewer-facing English prose remains unless it is a canonical technical term.
- Accessible names and live announcements match the visible Albanian action.
- Canonical IDs stay unchanged, visible, and copyable.
- Raw enums remain stable and have Albanian display labels.
- The localized disclaimer is not hashed into the canonical payload.
- Desktop and mobile proof covers inbox, workspace, validation, receipt, import, and correction states.
