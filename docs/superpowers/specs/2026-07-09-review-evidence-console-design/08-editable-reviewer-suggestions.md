# Design Appendix 8: Editable Reviewer Suggestions

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Goal

Open each reviewer item with a safe, editable starting point. Reduce repetitive typing without deciding, approving, or confirming evidence on the reviewer’s behalf.

## Approach Decision

Use fixture-owned suggestions for each item.

- Rejected: one generic answer for every item. It hides the item’s actual boundary.
- Rejected: runtime heuristics that invent answers from prompt text. They are hard to audit and can fabricate evidence.
- Selected: a validated `suggestedReview` object in each static fixture. It is explicit, deterministic, local-only, and testable.

## Safety Boundary

Suggestions may prefill editable text, structured responses, risk, severity, evidence references that exist in the repository, and the captured session date.

Suggestions must never set:

- the final decision (`approve`, `change`, or `block`);
- the repo-safe evidence confirmation checkbox;
- `requestedChange`, unless the reviewer manually selects change or block;
- a person’s name, signed authority, DPIA approval, or runtime authorization that the fixture cannot prove.

The workspace shows: `Sugjerime të paraplotësuara — verifikoji dhe ndryshoji para dërgimit.` Submission remains blocked until the reviewer selects a decision and confirms safe evidence.

## State And Persistence

- Add a validated `suggestedReview` object to every item fixture.
- Capture one `sessionDate` from an injected `getLocalDate()` dependency when the session starts. It returns the reviewer’s local calendar date as `YYYY-MM-DD`. Store the resulting values in the draft and never recompute them on restore.
- Store `suggestionVersion: 1` in the local draft, not in the receipt.
- Initialize in this order:
  1. A correction seeded from a receipt wins unchanged; apply no suggestions.
  2. A compatible draft with `suggestionVersion: 1` wins exactly, including blank values.
  3. A compatible legacy draft keeps every own property, including blank values. Fill absent properties only, set version 1, and persist once.
  4. A fresh session applies all allowed suggestions and version 1.
- “Absent” means `Object.hasOwn(record, key) === false`; an empty string or empty array is an intentional reviewer value, not an absent value.
- The final receipt contains only the reviewer’s resulting values. Suggestion metadata and provenance remain outside canonical JSON.

## Suggestion Schema And Validation

`suggestedReview` allows only these keys:

- `concreteAnswer`, `reason`, `evidenceRef`, `riskCategory`, and `severity`;
- `responses`, containing only keys declared by that item’s `requiredResponses`;
- `useSessionDateFor`, an array containing `verifiedAt` or descriptor keys whose type is `date`.

Reject `decision`, `requestedChange`, `safeEvidenceConfirmed`, `verifiedAt`, unknown top-level keys, unknown response keys, and date keys duplicated between `responses` and `useSessionDateFor`.

Normalize suggestions through the existing text limits and safe-text/evidence guards, item risk allowlist, severity allowlist, descriptor types, option allowlists, conditional applicability, and maximum lengths. `useSessionDateFor` keys must be unique and refer only to supported date fields. An invalid suggestion makes the packet unavailable; the repository must not fall back to partial or invented defaults.

## Common Evidence Reference

Use `docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md` only as the default repo reference. Its display helper states that it records requirements and blockers, not runtime authority. The reviewer can replace it with stronger accepted evidence.

## Item Suggestions

### M03A-PRIVACY-OWNER

- Answer: require a named privacy/legal owner before runtime promotion.
- Reason: `MOB-DG04` records the owner evidence as missing.
- Responses: leave `ownerDisplayName` unset for manual entry; prefill role `Privacy / Legal owner`, reviewer role `privacy`, session date, and the common evidence reference.
- Risk/severity: `legal` / `high`.

### M03A-MEDICAL-BOUNDARY

- Answer: medical and injury data remain excluded.
- Reason: no signed or accepted DPIA/Neni 9 authority is present.
- Responses: `medicalBoundary=excluded`; an Albanian disabled-scope statement; no default `dpiaRef`.
- Risk/severity: `privacy` / `high`.

### M03A-CONSENT-FIELDS

- Answer: accept only the minimum fixture metadata fields as a review requirement.
- Reason: accepted field requirements do not grant schema or runtime authority.
- Responses: `consentStatus`, `recordedAt`, and `consentVersion`; no additions without new authority; exclude raw documents and sensitive data.
- Risk/severity: `compliance` / `high`.

### M03A-ACCESS-ROLES

- Answer: member and internal case roles may view bounded metadata; all other listed roles remain excluded.
- Reason: sponsor, payer, and external-party access lacks accepted authority.
- Responses: member/internal=`view`; sponsor/payer/external=`exclude`.
- Risk/severity: `access` / `high`.

### M03A-DOCUMENT-BOUNDARY

- Answer: show metadata only; never show source-document content.
- Reason: the console fixture must preserve the document boundary.
- Responses: allow `state`, `category`, and `updatedAt`; forbid `raw_document`, `payment`, `medical`, and `legal_private`.
- Risk/severity: `privacy` / `high`.

### M03A-THREAT-RECHECK

- Answer: recheck access, retention, and disclosure before any runtime promotion.
- Reason: the current gate records consolidated threat proof as missing.
- Responses: all three threat areas; `recheckOutcome=stop` until proof exists.
- Risk/severity: `security` / `high`.

### M03A-ERASURE-REVOCATION

- Answer: hide metadata after erasure or revocation.
- Reason: stale or revoked data must not remain visible.
- Responses: `renderingRule=hide_metadata`; no retention note is required for this selection.
- Risk/severity: `privacy` / `high`.

### M03A-SCOPE-STOPS

- Answer: limit planning to non-medical car/property display metadata.
- Reason: runtime, sensitive data, documents, and authority expansion remain outside this fixture.
- Responses: bounded allowed/excluded Albanian scope; `stopCondition=missing_authority`.
- Risk/severity: `scope` / `high`.

## Verification

- Fixture normalization rejects missing, unknown, forbidden, over-length, or invalid suggestion values and date-key conflicts.
- Unit tests prove correction precedence, new-session defaults, absent-only legacy migration, exact restored-draft precedence, one-time local-date capture, and manual safety controls.
- Receipt tests prove suggestions do not alter schema, hashing, import, correction, or write-once behavior.
- Browser proof shows suggestions at desktop/mobile sizes and proves the reviewer can edit, clear, reload, validate, and submit final values.
