# Design Appendix 3: Data Model And Module Boundaries

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Data Model

The app uses seven independent model units.

### `ReviewAssignment`

Defines fixture assignment ID, packet ID, reviewer fixture ID, due date, risk, and status. Assignment status is `not_started`, `in_progress`, `ready`, or `submitted`. It is display state, not an authorization claim.

### `ReviewerProfile`

Defines a repo-safe fixture ID, display name, and internal role. It excludes account identifiers and customer data.

### `ReviewPacket`

Defines packet metadata, scope, stop conditions, assigned reviewer role, and ordered item IDs.

### `ReviewItem`

Defines the prompt, need, repo impact, guidance, base required fields, structured `requiredResponses` descriptors, and allowed risk categories for one item. A response descriptor defines `key`, `label`, `type`, `required`, `maxLength`, `options`, and conditional requirements.

### `ReviewDecision`

Stores the human decision, base evidence fields, and structured `responses` object for one item. The decision is nullable until the reviewer acts.

### `ReviewDraft`

Stores assignment ID, packet ID and version, reviewer fixture ID, item decisions, active item, per-tab `editorId`, update timestamp, and schema version.

### `SubmissionReceipt`

Stores the application-level write-once, tamper-evident submitted snapshot, receipt ID, previous receipt ID when correcting, and authority disclaimer.

Packet definitions, reviewer profiles, and example assignments live in repo-safe JSON. State helpers consume and return plain objects. UI components do not read or write browser storage directly.

### Loader And Storage Interfaces

`FixtureRepository` owns bundled data:

- `listAssignments(reviewerFixtureId)` returns assignment summaries;
- `loadPacket(packetId)` returns one normalized packet;
- `loadReviewerProfile(reviewerFixtureId)` returns one repo-safe profile.

`DraftStore` owns mutable drafts:

- `load(draftKey)`;
- `save(draftKey, draft, expectedUpdatedAt)`;
- `remove(draftKey)`;
- `exportRecovery(draftKey)`.

`ReceiptStore` owns application-level write-once, tamper-evident receipts:

- `list(packetId)`;
- `load(receiptId)`;
- `save(receipt)`;
- `import(jsonText)`;
- `remove(receiptId)`.

Saving an existing receipt ID with the same canonical body is idempotent and returns the stored receipt. Saving the same ID with different content returns `hash_mismatch`. Load and export re-verify the canonical hash before returning data; nested mutation is treated as corruption, not immutability.

Every loader and store method returns:

```text
{ ok: true, value } | { ok: false, code, message }
```

Stable error codes include `not_found`, `invalid_data`, `schema_mismatch`, `conflict`, `quota`, `hash_mismatch`, and `unavailable`. Stores own keys, serialization, schema checks, and browser exceptions. Views receive plain values and callbacks only.

### Receipt Canonicalization

Receipt generation follows a deterministic contract:

1. Create `submittedAt` once as an ISO-8601 UTC string.
2. Set `receiptVersion` to `1` for the first submission or `previous.receiptVersion + 1` for a correction.
3. Build the payload with packet, assignment fixture, reviewer fixture, decisions, structured responses, risk summary, timestamps, previous receipt ID, and authority disclaimer.
4. Sort all object keys recursively. Preserve array order from the packet definition.
5. Serialize canonical JSON without `receiptId`.
6. Hash the UTF-8 bytes with SHA-256 through `crypto.subtle`.
7. Set `receiptId` to `rec_` plus the first 24 lowercase hexadecimal hash characters.
8. Store the receipt before enabling export.

Risk aggregation selects the highest severity in `none < low < medium < high`; ties return unique risk categories sorted alphabetically. Receipt import repeats canonicalization and rejects a mismatched ID.

Assignment loading and receipt import also validate that assignment packet ID, assignment reviewer fixture ID, reviewer profile fixture ID, packet reviewer role, and receipt metadata agree. A mismatch returns `invalid_data` and does not change local storage.

## Module Boundaries

New code files must stay under 150 lines where practical and below the repository's 200-line ceiling.

- `data/`: repo-safe packet and assignment fixtures;
- `models/`: JSDoc model contracts and normalization;
- `state/`: draft reducer, storage adapter, and receipt builder;
- `validation/`: item and packet validation;
- `views/`: inbox, workspace, validation summary, and receipt renderers;
- `components/`: packet rail, decision controls, evidence fields, autosave status, and notices;
- `styles/`: tokens, layout, components, and responsive rules;
- `server/`: a dependency-free local static server only;
- `tests/`: Node unit tests for pure model, validation, storage, and receipt helpers.

Each module exposes one narrow interface. Renderers receive data and callbacks. State helpers own persistence. Validation remains pure. Receipt generation remains deterministic.
