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

## Detailed Authority

The complete item recommendation table, interaction rules, component boundaries, error
handling, test contract, and non-goals are preserved verbatim in the linked detail:

- [Reviewer contextual default notes design details](./2026-07-11-reviewer-contextual-default-notes-design-details.md)
