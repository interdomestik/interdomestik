---
plan_role: input
status: approved
owner: product-design + qa
last_reviewed: 2026-07-11
related:
  - docs/superpowers/specs/2026-07-09-review-evidence-console-design.md
  - docs/plans/2026-07-10-rec-dg01-review-evidence-console-current-authority.md
---

# Reviewer Contextual Default Notes Design

## Goal

Reduce reviewer typing without making a decision or inventing authority. Every safe
text note should start with a useful Albanian recommendation that the reviewer can
keep, edit, or clear.

## Existing Behavior

The console already suggests the concrete answer, reason, repo reference, risk,
severity, session date, and most structured responses. It leaves the final decision,
safe-evidence acknowledgement, and real owner name manual. This design preserves
those boundaries and fills the remaining safe note gaps.

## User Contract

- Apply a recommendation only when its field is empty.
- Never replace reviewer-authored text, including an intentionally cleared value in
  a restored versioned draft.
- Keep every recommendation editable and label the form once as suggested content.
- Keep `approve`, `change`, and `block` unselected until the reviewer acts.
- Keep the safe-evidence checkbox unchecked.
- Keep `ownerDisplayName` blank because it requires a real person.
- Keep `dpiaRef` and any missing evidence reference blank because the console must not
  fabricate authority.
- Do not add suggestion metadata to the submitted receipt.

## Recommended Note Contract

Extend each item's strict `suggestedReview` fixture with one required
`requestedChange` string. Add an optional `conditionalResponses` object only for
safe text fields that become visible after another response changes.

```json
{
  "requestedChange": "Item-specific Albanian recommendation",
  "conditionalResponses": {
    "retentionNote": "Safe Albanian recommendation"
  }
}
```

`conditionalResponses` may reference a descriptor only when it is conditional,
textual, non-identity, and not an `evidenceRef`. Unknown keys, sparse values, unsafe
text, and values above the descriptor limit fail fixture normalization.

## Item Recommendations

| Item                      | Default `requestedChange` note                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `M03A-PRIVACY-OWNER`      | Emërto një pronar real të privatësisë ose ligjor dhe bashkëngjit evidencën e pranimit para promovimit.          |
| `M03A-MEDICAL-BOUNDARY`   | Mbaji të dhënat mjekësore dhe të lëndimeve të çaktivizuara derisa të ketë autoritet të nënshkruar DPIA/Neni 9.  |
| `M03A-CONSENT-FIELDS`     | Kufizo fushat te statusi, data dhe versioni i pëlqimit; çdo shtesë kërkon autoritet të ri.                      |
| `M03A-ACCESS-ROLES`       | Lejo vetëm rolet e mostrës dhe përjashto sponsorin, paguesin dhe palët e jashtme pa autoritet të ri.            |
| `M03A-DOCUMENT-BOUNDARY`  | Shfaq vetëm metadata të lejuara dhe mos shfaq dokumentin burimor ose kategoritë e ndaluara.                     |
| `M03A-THREAT-RECHECK`     | Ndalo promovimin derisa rikontrolli i qasjes, ruajtjes dhe zbulimit të ketë evidencë të pranueshme.             |
| `M03A-ERASURE-REVOCATION` | Fshih metadatat pas fshirjes ose revokimit; çdo gjendje e dukshme kërkon rregull të dokumentuar ruajtjeje.      |
| `M03A-SCOPE-STOPS`        | Kufizo fushën te metadata jo-mjekësore për automjet dhe pronë; ndalo kur mungon autoriteti ose zgjerohet fusha. |

For `M03A-ERASURE-REVOCATION`, activating `show_revoked_state` also suggests:

> Shfaq vetëm statusin e revokuar dhe afatin e dokumentuar të ruajtjes; mos shfaq
> metadata të tjera.

## Interaction Rules

### Decision activation

When the reviewer selects `change` or `block`, show `requestedChange` with the
item-specific recommendation if the field is empty. Selecting `approve` does not add
the note to the receipt. Returning to `change` or `block` must preserve existing
reviewer text.

### Conditional response activation

After a controlling response changes, prune fields that are no longer applicable as
today. When a safe conditional text field becomes applicable, apply its recommendation
only if the response is absent. Do not apply a default to `dpiaRef`.

### Draft recovery

Fresh and legacy initialization may add allowed recommendations under the existing
suggestion-version rules. A versioned draft restores exact values, including blanks,
without reapplying defaults. Autosave and conflict behavior remain unchanged.

## Components And Boundaries

- Fixture JSON owns the exact Albanian recommendations.
- Suggestion normalization validates the extended strict contract.
- Review initialization applies fresh and legacy defaults.
- Session-state decision and response transitions apply contextual defaults without
  owning UI copy.
- Receipt construction removes inapplicable `requestedChange` text and all suggestion
  metadata.
- Existing rendering components remain presentation-only.

No new route, page, dependency, network call, storage service, auth behavior, or
production integration is part of this change.

## Error Handling

Invalid recommendation fixtures fail closed with `invalid_data`. A missing optional
conditional recommendation leaves the field empty. Runtime application errors must
not overwrite the current draft or select a decision.

## Test Contract

- Fixture tests assert all eight exact Albanian `requestedChange` values.
- Normalization tests reject missing, unknown, unsafe, over-limit, identity, and
  evidence-reference conditional defaults.
- State tests prove first-use application, non-overwrite, versioned blank recovery,
  conditional activation, pruning, and immutable snapshots.
- Receipt tests prove approve omits hidden requested-change content and every receipt
  excludes suggestion metadata.
- Browser tests prove recommendations are visible and editable while decision and
  safe-evidence controls remain manual on desktop and mobile.

## Non-Goals

- No suggested final decision.
- No suggested safe-evidence acknowledgement.
- No invented person, signature, DPIA, or evidence path.
- No redesign, new workflow step, AI generation, or production deployment.
