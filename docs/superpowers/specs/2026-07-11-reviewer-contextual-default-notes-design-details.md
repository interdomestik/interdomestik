# Reviewer Contextual Default Notes Design Details

> Canonical design index: [Reviewer Contextual Default Notes Design](./2026-07-11-reviewer-contextual-default-notes-design.md)

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

### Persisted note state

Drafts with `suggestionVersion: 2` add `contextualNoteState` per item and field. The
draft store's independent `schemaVersion` remains unchanged. This sidecar never enters
a receipt. Each tracked note has one status:

- `unseen`: the recommendation has not been offered;
- `suggested`: the displayed value still equals the recommendation;
- `custom`: the reviewer supplied a different non-empty value;
- `dismissed`: the reviewer intentionally cleared the field.

Conditional `custom` notes also retain their exact safe-text value in the sidecar
while the response is inapplicable. `dismissed` retains no value. Unknown item IDs,
field paths, statuses, or unsafe sidecar values make the draft invalid and recoverable
under the existing fail-closed recovery flow.

### Decision activation

When the reviewer selects `change` or `block`, show `requestedChange` with the
item-specific recommendation only when its status is `unseen` or `suggested` and the
field is empty. Input equal to the recommendation stays `suggested`; different
non-empty input becomes `custom`; clearing becomes `dismissed`. Selecting `approve`
keeps the draft text and note state for a later return, but approve receipts omit the
`requestedChange` key entirely. Returning to `change` or `block` restores `custom`
text, keeps `dismissed` blank, or offers the default for `unseen`/`suggested`.

### Conditional response activation

After a controlling response changes, prune fields that are no longer applicable as
today. Before pruning a contextual note, retain `custom` text and its status in the
sidecar; retain `dismissed` as a tombstone. When the field becomes applicable again,
restore `custom` text, keep `dismissed` blank, or apply the recommendation for
`unseen`/`suggested`. Do not track or apply a default to `dpiaRef`.

### Draft recovery

This feature bumps `suggestionVersion` from 1 to 2. Fresh and unversioned legacy
initialization may add allowed recommendations and creates valid version-2 note state.
Version-1 drafts migrate without applying new contextual notes: every blank contextual
field becomes `dismissed`, every non-empty field becomes `custom`, and all other
reviewer values restore exactly. Version-2 drafts restore exact values and sidecar
state without reapplying defaults. Unsupported owned versions remain recoverable.
Autosave and conflict behavior remain unchanged.

## Components And Boundaries

- Fixture JSON owns the exact Albanian recommendations.
- Suggestion normalization validates the extended strict contract.
- Review initialization applies fresh and legacy defaults.
- Session state owns the validated `contextualNoteState` sidecar and applies exact
  decision/response transition rules without owning UI copy.
- Receipt construction removes inapplicable `requestedChange` text and all suggestion
  or contextual-note metadata; approve receipts omit the `requestedChange` key.
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
  version-1 migration, custom/dismissed tombstones, conditional deactivate/reactivate,
  pruning, and immutable snapshots.
- Receipt tests prove approve omits the `requestedChange` key and every receipt excludes
  suggestion and contextual-note metadata recursively.
- Browser tests prove recommendations are visible and editable while decision and
  safe-evidence controls remain manual on desktop and mobile.

## Non-Goals

- No suggested final decision.
- No suggested safe-evidence acknowledgement.
- No invented person, signature, DPIA, or evidence path.
- No redesign, new workflow step, AI generation, or production deployment.
