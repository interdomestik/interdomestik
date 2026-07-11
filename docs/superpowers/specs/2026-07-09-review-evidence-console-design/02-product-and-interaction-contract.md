# Design Appendix 2: Product And Interaction Contract

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Product Structure

The console has four primary states.

### 1. Assignment Inbox

The inbox lists assigned packets only. Each packet shows its title, canonical ID, purpose, risk, progress, and due state. The primary action opens or resumes the packet.

The inbox does not show a global reviewer directory, all-program metrics, or a dense status table.

### 2. Guided Review Workspace

The desktop workspace uses three columns:

- packet rail: item order, state, and scope guard;
- decision canvas: current prompt, guidance, decision, answer, and reason;
- evidence rail: evidence reference, verification date, risk, and safety copy.

Tablet moves the evidence rail into a side sheet. Mobile stacks the packet stepper above the decision and uses a sticky `Save & continue` action bar.

### 3. Validation Summary

Validation runs before packet completion. It groups missing fields by item, focuses the first invalid control, and lets the reviewer jump to any incomplete item.

Validation never deletes or resets the draft.

### 4. Submission Receipt

The receipt is read-only and records:

- packet ID and version;
- reviewer name and role;
- submitted timestamp;
- each item decision and evidence fields;
- packet risk summary;
- the authority disclaimer;
- a deterministic receipt ID.

The reviewer can export the receipt as JSON or return to the assignment inbox.

The console saves the receipt locally before offering export. A reviewer can import a compatible receipt JSON file after reload and start a versioned correction from it. Receipt import validates schema version, packet ID, receipt ID, field limits, and canonical hash before storing the receipt.

## Visual System

The console uses Interdomestik's existing professional blue/teal design language without importing runtime components.

- primary: deep professional blue derived from `--primary: 200 85% 28%`;
- accent: teal derived from `--accent: 175 70% 30%`;
- surfaces: white and cool gray from the existing UI tokens;
- success, warning, and destructive states use text labels plus color;
- typography follows Space Grotesk for headings and Inter for UI copy when available;
- default radius is 12px;
- shadows remain restrained and functional;
- motion is limited to short state transitions and respects reduced motion.

The interface keeps canonical IDs visible as small metadata. Albanian describes the task and action. English identifiers never replace plain-language guidance.

## Interaction Contract

### Explicit Decisions

Each item starts without a decision. The console must not preselect or infer `approve`, `change`, or `block`.

System guidance appears in a separate panel. `Use as a starting point` may copy guidance into editable fields, but it must not select a decision or mark an item complete.

### Draft Persistence

The client saves draft state to `localStorage` after a short debounce. A draft key is:

```text
review-console:v1:draft:<assignmentId>:<reviewerFixtureId>:<packetVersion>
```

Each key segment must match `[a-zA-Z0-9._-]+`. The store rejects invalid segments before composing a key. This prevents two assignments, reviewers, or packet versions from sharing a draft.

The top bar exposes four states:

- `Saving`;
- `Saved at HH:MM`;
- `Offline — saved on this device`;
- `Save failed — retry`.

Opening the app restores the newest compatible draft. A schema-version mismatch keeps the stored value intact, shows a recovery message, and offers raw draft recovery export instead of destructive migration.

For an incompatible draft, the recovery action exports the untouched draft as `review-draft-recovery.json`; it does not label the draft as a submission receipt. Corrupt JSON remains untouched in storage until the reviewer downloads or deletes it.

The app attaches an `updatedAt` timestamp and a random per-tab `editorId` to each draft save. If another tab writes a newer draft, the current tab stops autosaving and offers `Reload newer draft` or `Export my local copy`. V1 does not merge concurrent edits.

### Item Completion

An item is complete only when it has:

- an explicit decision;
- a concrete answer;
- a reason;
- an evidence reference;
- a verification date;
- a risk category;
- a severity;
- a requested change when the decision is `change` or `block`.

These fields form the base requirement. Each `ReviewItem` also declares structured field descriptors in `requiredResponses`. The validator resolves completion from the item definition, not from a hard-coded universal form.

The `MOB-03a` fixtures require these structured responses:

- privacy owner: owner display name, owner role, decision date, evidence reference, reviewer role;
- medical boundary: `excluded` or `allowed`; `excluded` requires a disabled-scope statement, while `allowed` requires a DPIA / Art. 9 reference;
- consent fields: accepted minimum field list, additions, and exclusions;
- access roles: member, internal case-scoped role, sponsor, payer, and external-party decisions;
- document boundary: allowed metadata and forbidden data categories;
- threat recheck: reviewed threat areas and repo-safe evidence references;
- erasure and revocation: the accepted rendering rule;
- scope and stops: allowed scope, excluded scope, and stop conditions.

The UI shows completion as text and color. A decision can change until the packet is submitted.

### Corrections

A correction starts from a submitted receipt. It creates a new version with:

- the previous receipt ID;
- the corrected item ID;
- a correction reason;
- correction impact;
- the new decision and evidence fields.

The previous receipt remains read-only.

Receipts persist in a separate `ReceiptStore`. Draft reset or deletion cannot delete a receipt. The reviewer may delete a local receipt only through a receipt-specific action that names the receipt ID and requires confirmation.
