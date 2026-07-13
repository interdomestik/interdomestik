---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-13
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/2026-07-13-rec-02-closeout.md
  - docs/plans/2026-07-13-rec-dg04-vercel-node-function-current-authority.md
---

# REC-DG05 Current Authority: Legacy Receipt Migration And Review History

> Status: current-authority/design gate. This record promotes exactly one
> implementation slice: `REC-02b`.

## Decision

`REC-02a` produced a working protected preview with named accounts, role-scoped
assignments, Ed25519 receipts, and a Node.js Vercel Function. The preview also
proved a continuity gap: the already accepted MOB-03a Part A and Part B receipts
use the prior unsigned local format, so the new verifier correctly excludes them
and shows their assignments as incomplete. Reviewers must not repeat accepted
work merely because the attestation format changed.

This Tier 0 gate promotes one Tier 3 continuity slice:

`REC-02b` — add authenticated, reviewer-confirmed migration of the two accepted
MOB-03a legacy receipts into the current signed receipt envelope, preserve
immutable migration lineage, and expose completed receipt history locally.

## Accepted Inputs

- Part A: receipt `rec_51f0d862d5f41cf26e3e60fc`, assignment
  `assign_mob03a_part_a`, packet version `3`, accepted in `MOB-DG04b`.
- Part B: receipt `rec_1298f380aa840d71c2970a99`, assignment
  `assign_mob03a_part_b`, packet version `3`, accepted in `MOB-DG04b`.
- Both receipts identify Gazmend Abazi in the governance reviewer role and passed
  the prior canonical hash, packet-version, key, and content checks.
- The source JSON files remain private evidence. Their contents, credentials, and
  signing keys must not be committed, logged, or embedded in a deployment.

## Promoted Scope

REC-02b may change only `tools/review-evidence-console/`, focused console tests,
repo-size budget data, and required tracker/closeout records. It may:

- accept a bounded legacy receipt as an authenticated, stateless attestation
  request without server storage or file persistence;
- verify the legacy canonical receipt ID, assignment, packet version, completion,
  reviewer display name, fixture, and role against the signed-in account;
- require one explicit reviewer confirmation before migration and never rewrite
  review answers or silently create a disposition;
- issue a current Ed25519 receipt from the exact accepted decisions with signed
  lineage to the immutable source receipt and its original submission time;
- store the returned receipt in the existing local-only browser repository and
  mark the assignment `Dorëzuar`;
- add an Albanian-first `Historia e shqyrtimeve` view that lists current and prior
  local receipts, versions, author, date, decision, lineage, and receipt download;
- apply a focused reviewer-console visual redesign to the inbox, history, receipt,
  and account shell with stronger hierarchy, responsive navigation, professional
  trust styling, accessible state markers, and one clear primary action;
- expose a clear `Kërko ndryshim` action that starts a new correction version
  without mutating or hiding the prior version;
- complete REC-02a provider proof on the Vercel Hobby plan using the active
  Firewall rule, bounded runtime logs, role isolation, signed receipts, and the
  captured rollback deployment.

The implementation is test-first. Every changed source file remains under 150
lines. Migration must fail closed on identity, role, assignment, packet-version,
content, completeness, source-ID, or signature mismatch.

## Review History Contract

The inbox contains active work. History contains all locally available completed
and superseded receipts. A correction creates a new immutable version linked to
its predecessor; it never edits a submitted receipt in place. Local-only means
history follows the browser profile, not the person across devices. Cross-device
or organization-wide archival requires a future separately gated encrypted
receipt store, audit log, retention policy, and role-scoped access model.

## Provider Proof And Cutover

The active Vercel Firewall rule blocks the sixth matching login request with a
provider `429` and `x-vercel-mitigated: deny`; the Hobby response does not include
`Retry-After`. Five application `login_failed` events and no sixth application
event prove the provider stopped the request upstream. Vercel alerting is a Pro
feature and is not available on the current Hobby project. REC-02b therefore
accepts bounded runtime-log inspection plus the manual six-request probe as the
Hobby-native operational proof; it does not authorize a paid plan upgrade.

After all focused tests, repository gates, current-head CI, independent review,
and protected-preview checks are green, this gate authorizes reassignment of
`reviewer-ecohub.vercel.app` to the exact verified deployment. Roll back to
deployment `dpl_8KrtKZorqmSWB7XLEKRaaJZ4tjVu` on any post-cutover authentication,
assignment, migration, history, receipt, cache, or routing mismatch.

## Exclusions

No `apps/web`, Interdomestik production route, proxy, auth, tenant, schema/RLS,
database, Supabase, Blob, server receipt storage, customer data, document upload,
email, billing, paid Vercel upgrade, MOB runtime, broad UI redesign, dependency,
lockfile, README, AGENTS, or architecture change is authorized. A future shared
cross-device archive is explicitly not promoted by this gate.

## Resolver Effect

After this gate lands:

```text
status: ready
activeSlice: REC-02b
```

No other implementation slice is active.
