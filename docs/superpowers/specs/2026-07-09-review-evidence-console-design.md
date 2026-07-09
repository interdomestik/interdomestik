# Interdomestik Review & Evidence Console Design

## Goal

Create a standalone internal console that helps an assigned reviewer complete one evidence packet quickly, safely, and with an auditable result. The console produces evidence for the repository's current-authority process; it never grants execution authority.

## Authority And Context

This design follows the repository authority at `main` commit `2d63bc79d5e0c54cbb75da2c83e9f3ecfca84c89`.

The AI OS under `/Users/arbenlila/Documents/Knowledge Manager and Systems Architect` remains advisory. Its 2026-07-09 `Now` and `Next Product Actions` pages still cite `main` at `1a15b956` after `MOB-02a`. The repository has since added `MOB-DG04` and the `MOB-03a` authority evidence packet. Repository authority wins. The latest packet still states:

```text
status: blocked_requires_current_authority
activeSlice: null
```

The console therefore remains separate from Interdomestik runtime. It must not alter canonical routes, `apps/web/src/proxy.ts`, auth, tenancy, billing, schema, RLS, member data, claim data, or current-authority records.

## Current Portal Evaluation

The protected portal at `https://reviewer-ecohub.vercel.app` already proves the core need. It captures reviewer identity, assigned steps, explicit decisions, evidence references, risks, corrections, autosaved drafts, and submissions.

The audit found five primary usability problems:

1. The landing page makes reviewers pass through identity fields, correction mode, status cards, filters, and a 17-step operational table before they reach one decision.
2. The workbench keeps a long process tab bar, item list, oversized mock-phone preview, guidance, decision form, evidence fields, and submission controls on one page.
3. The interface mixes Albanian product copy with dense English technical language and repo paths without a clear hierarchy.
4. Desktop space is poorly allocated: the mock-phone panel creates a large empty area while decision fields sit below the fold.
5. The mobile table clips horizontally and requires scanning controls designed for desktop.

The existing portal also stores low-sensitivity uploads in public Vercel Blob storage. The new v1 removes uploads and uses repo-safe evidence references only.

## Primary User And Outcome

The primary user is an assigned internal reviewer such as a business, operations, legal, privacy, product, or platform owner.

The primary outcome is:

> Complete one assigned evidence packet with explicit decisions, real evidence references, visible validation, and a durable submission receipt.

The console is reviewer-first. Operator dashboards, global analytics, assignment administration, and cross-product portfolio views remain outside v1.

## Local Design-Proof Boundary

The v1 is a local design proof, not an authenticated review system. Bundled assignments and internal reviewer profiles are repo-safe fixtures. The assignment inbox demonstrates the reviewer flow; it does not enforce authorization or prove that a real person received an assignment.

An internal reviewer profile may contain a display name, role, and fixture ID. It must not contain an email address, phone number, account ID, or customer identity. The UI labels fixture assignments as `Local review fixture`. Production identity, authentication, assignment delivery, and access control require a separate approved design.

## Success Criteria

The v1 succeeds when a reviewer can:

- open an assigned packet without first navigating a global operations table;
- understand the packet scope and stop conditions;
- complete each item with an explicit `approve`, `change`, or `block` decision;
- distinguish system guidance from the human decision;
- record a concrete answer, reason, evidence reference, verification date, risk category, and severity;
- recover a local draft after refresh or temporary failure;
- see all missing fields before submission;
- submit the complete packet and export a read-only JSON receipt;
- create a correction as a new version without overwriting prior evidence;
- complete the flow on desktop, tablet, or mobile without horizontal tables.

## Scope

### Included

- a standalone tracked app under `tools/review-evidence-console/`;
- an assignment inbox containing realistic repo-safe packets;
- repo-safe fixture assignments and internal reviewer profiles;
- a guided review workspace;
- local draft persistence;
- explicit decision and evidence fields;
- packet validation;
- versioned corrections;
- read-only completion receipts;
- JSON receipt export;
- responsive behavior and accessible interaction states;
- Albanian-first UI copy with canonical English packet and item IDs.

### Excluded

- Interdomestik runtime integration;
- changes under `apps/web/` or `packages/`;
- `/member`, `/agent`, `/staff`, or `/admin` routes;
- current-authority promotion or tracker mutation;
- member, claim, payment, medical, or customer identity records;
- network file uploads or remote file transfer; local receipt import remains included;
- production authentication or deployment;
- real assignment authorization or delivery;
- Vercel Blob writes;
- AI-generated decisions;
- global operator analytics;
- assignment authoring or reviewer administration;
- README, AGENTS, architecture, schema, RLS, billing, or notification changes.

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

Stores the immutable submitted snapshot, receipt ID, previous receipt ID when correcting, and authority disclaimer.

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

`ReceiptStore` owns immutable receipts:

- `list(packetId)`;
- `load(receiptId)`;
- `save(receipt)`;
- `import(jsonText)`;
- `remove(receiptId)`.

Saving an existing receipt ID with the same canonical body is idempotent and returns the stored receipt. Saving the same ID with different content returns `hash_mismatch`.

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

### Local Static Server Contract

The server serves the console only; it exposes no API or write route.

- bind to `127.0.0.1` by default;
- accept an optional numeric `PORT` between 1024 and 65535;
- accept only `GET` and `HEAD`; return `405` with `Allow: GET, HEAD` for every other method;
- serve files from the console's fixed `public/` root;
- decode the request path once; return `400` on malformed encoding;
- normalize the path and reject any resolved path outside the fixed root with `403`;
- map `/` to `/index.html`; do not list directories;
- serve only `.html`, `.css`, `.js`, `.mjs`, `.json`, `.png`, `.webp`, and `.woff2` with explicit MIME types;
- return `404` for missing files and `415` for unsupported extensions;
- send plain-text error bodies without reflecting the request path;
- send `Cache-Control: no-store` during local development;
- send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cross-Origin-Resource-Policy: same-origin`;
- send a CSP equivalent to `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'none'`.

The implementation uses external module and stylesheet files so the CSP needs no inline-script or inline-style exception.

## Security And Privacy

The v1 processes repo-safe evidence only. `Repo-safe` means fixture choices, short operational prose, and repository-relative evidence references. It excludes customer content and private remote locations.

- no network file uploads;
- no external writes;
- no secrets, credentials, tokens, raw customer identifiers, or private URLs;
- no member, claim, payment, medical, or legal documents;
- no use of the existing portal's Vercel credentials or Blob store;
- receipt import may read one local `.json` file through `File.text()`; the browser never transmits that file, and the UI labels this action `Import local receipt` rather than `Upload`;
- the evidence-reference validator applies only to evidence-reference fields and accepts `^(docs|output/review)/[A-Za-z0-9._/-]+(?:#L[1-9][0-9]*)?$` after trimming;
- the evidence-reference validator rejects `..`, repeated `//`, control characters, and values longer than 240 characters before applying the allowlist pattern;
- short answers and reasons allow at most 2,000 characters; requested changes allow at most 1,000 characters;
- structured text responses declare lower per-field limits in the packet definition;
- the free-text guard applies to concrete answers, reasons, requested changes, owner/reviewer display names, and every structured response whose descriptor type is `text` or `textarea`;
- the free-text guard rejects the case-insensitive email pattern `\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`;
- the free-text guard rejects the case-insensitive URL-scheme pattern `\b(?:https?|ftp|file|data):\/\/`;
- the free-text guard rejects the case-insensitive credential pattern `\b(?:Bearer|Basic|api[_-]?key|access[_-]?token|refresh[_-]?token)\b|\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+`;
- the free-text guard rejects unbroken 12-to-19 digit sequences with `\b[0-9]{12,19}\b`;
- all user-entered string fields reject control characters in `U+0000–U+0008`, `U+000B`, `U+000C`, `U+000E–U+001F`, and `U+007F`;
- option, boolean, date, and fixed role-matrix responses validate against their descriptors and do not run free-text patterns;
- packet content and user input render through `textContent`; the app never injects input through `innerHTML`;
- JSON export escapes and serializes plain data only;
- `localStorage` copy warns that the device holds the draft;
- the reviewer must confirm `This packet contains repo-safe evidence only` before submission;
- drafts and receipts remain on the device until the reviewer deletes them with the console's local-data controls;
- `Clear local review data` reports the number of drafts and receipts and requires confirmation;
- the completion receipt repeats that it is evidence intake, not runtime authority.

The guard reduces accidental sensitive input but cannot prove prose is safe. The local design proof must carry this limit in its safety copy. Production handling of real legal, privacy, or identity evidence requires private storage, authentication, retention policy, and a separate authority decision.

## Error And Edge States

The app must handle:

- missing or malformed packet JSON with a clear unavailable-packet screen;
- an unknown packet or item ID without crashing;
- incompatible stored drafts without deletion;
- corrupt stored drafts with recovery download and explicit deletion;
- a newer draft written by another tab;
- local storage quota or write failures with retry and export options;
- incomplete items with inline messages and a grouped summary;
- network loss without blocking local work;
- duplicate submit actions by disabling the action during receipt generation;
- correction attempts without a prior receipt;
- receipt imports with schema, hash, packet, size, or field-validation failures;
- local receipt files larger than 1 MiB or with a non-JSON extension;
- empty inbox state;
- narrow viewports and 200% text zoom;
- reduced-motion preference;
- an unavailable download path with a copyable receipt fallback.

## Accessibility

The console targets WCAG 2.2 AA behavior.

- semantic landmarks and heading order;
- native form controls and explicit labels;
- full keyboard access;
- visible focus indicators;
- 44px minimum mobile targets;
- status labels that do not rely on color;
- live regions for autosave and submission states;
- focus management after validation and view changes;
- no horizontal table required for the core flow;
- reduced-motion support;
- layouts that remain usable at 320px width and 200% zoom.

## Verification

### Unit Proof

Node tests cover:

- explicit-decision requirements;
- conditional requested-change rules;
- packet completion;
- deterministic receipt IDs and receipt content;
- correction version linkage;
- draft normalization;
- storage failure behavior;
- incompatible schema handling.
- fixture repository normalization and error results;
- receipt store save, import, list, and correction reload;
- multi-tab conflict detection;
- evidence-reference and sensitive-input guards;
- static-server method, traversal, MIME, CSP, and error-response rules.

### Browser Proof

The in-app browser validates:

- inbox to packet navigation;
- item decisions and validation;
- autosave and refresh recovery;
- submission receipt and JSON export;
- correction creation;
- receipt import after reload;
- keyboard flow and visible focus;
- desktop, tablet, and mobile layouts;
- console logs without errors or warnings.

Browser proof uses the repository's Playwright MCP path first. Manual inspection supplements automated accessibility checks for reading order, focus visibility, zoom, and responsive layout.

### Repository Proof

Before completion, run:

```bash
git diff --check
node --test tools/review-evidence-console/tests/*.test.mjs
pnpm format:check
pnpm lint
pnpm type-check
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

If a mandatory repository gate is blocked by environment or infrastructure, report the exact command, exit code, and blocker. Never infer a pass from a focused check.

## Acceptance Criteria

The implementation is acceptable when:

1. It stays entirely under `tools/review-evidence-console/`, except its approved spec and plan.
2. It does not modify Interdomestik runtime, routing, auth, tenancy, billing, schema, RLS, README, AGENTS, or architecture files.
3. It demonstrates the four primary product states with realistic `MOB-03a` repo-safe content.
4. A reviewer can complete, validate, submit, export, reload, and correct a packet.
5. Every decision remains human-owned and explicit.
6. The app exposes no network upload path, reads receipt imports locally only, includes no sensitive fixture data, and rejects the prohibited reference and sensitive-input test cases defined above.
7. Desktop, tablet, mobile, keyboard, and reduced-motion flows remain usable.
8. Focused tests and mandatory repository gates produce fresh evidence.

## Implementation Decision

Build the standalone console as dependency-free HTML, CSS, and ES modules served by a small Node static server. This keeps the app isolated, reviewable, and runnable with the repository's existing Node runtime. The implementation may use Lucide icons only if the existing package can be consumed without adding a new dependency; otherwise it should use text labels and native controls.

Use bundled/system font stacks so the local app works offline: `Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif` for headings and `Inter, ui-sans-serif, system-ui, sans-serif` for body copy. Do not fetch fonts from a CDN.

Do not modify or deploy the existing protected reviewer portal in this slice. The new console is a local working app and design proof. Production authentication, private remote persistence, and deployment require a separate approved design and authority decision.
