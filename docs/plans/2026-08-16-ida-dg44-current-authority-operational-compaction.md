---
gate_id: IDA-DG44
slice_id: IDA-GOV01-CURRENT-AUTHORITY-COMPACTION
classification: promotion/design-gate
risk_tier: 0
status: reviewed_candidate_not_approved
base_main: 523fda2493ca728dea48241aad5769917f1ad03f
date: 2026-08-16
---

# IDA-DG44 — Current-authority operational compaction

## Decision requested

Approve one repository-governance slice that replaces the append-only use of
`docs/plans/current-program.md` and `docs/plans/current-tracker.md` with small
operational documents while preserving every historical byte through an
immutable, content-addressed Git archive manifest.

This gate selects no product slice and grants no product runtime. After this
compaction closes, a separate current-authority selection may choose exactly one
product slice.

## Check-first evidence

- Repository main is clean and synchronized with `origin/main` at
  `523fda2493ca728dea48241aad5769917f1ad03f` (`ahead=0`, `behind=0`).
- AI OS check observation
  `9a4d030059c91501f704e46b3436e9a253f3936ef850ecf65cdfb84337922809`
  exited 0: Brain `current`, Integrity `clear`, Interdomestik authority
  `current`, lifecycle `blocked_requires_current_authority`,
  `activeSlice=null`, runtime `not_authorized`, control revision `273`.
- Canonical resolver returned
  `blocked_requires_current_authority / umbrella_without_concrete_promoted_slice`.
- Main is the only repository writer. The separate clean user-owned worktree
  `/Users/arbenlila/development/interdomestik-infra-upgrade-roadmap` at
  `9d1f40b929a8b3e8dc676472719145e2064cda79` changes only its roadmap plan and
  is excluded. Explicit branch-hygiene allowlisting passed with report SHA-256
  `fc352b9ea6af31779ead44a82592815390b8a81ad7de1e562d1282d302efa232`.
- Open PRs are only Dependabot PRs `#1567`, `#1553`, and `#1508`; no product or
  current-authority PR is open.
- Existing baseline audits pass: `pnpm plan:audit`, `pnpm track:audit`, and
  `pnpm docs:verify`.

## Measured problem

| Document | Bytes | Lines | Operational/history evidence |
| --- | ---: | ---: | --- |
| `current-program.md` | 785,382 | 8,232 | 247 `Rev` blocks, 61 active-goal markers, 507 PR references, 342 run-ID-shaped references |
| `current-tracker.md` | 1,665,126 | 3,313 | 635 Active Queue rows, 635 Proof Ledger rows, 86 narrative `Rev` blocks, 56 active-goal markers, 953 PR references, 568 run-ID-shaped references |
| Combined | 2,450,508 | 11,545 | historical evidence dominates the current authority surface |

For `current-program.md`, only 2,518 bytes precede its first revision narrative;
782,864 bytes are revision history. In `current-tracker.md`, Active Queue is
558,646 bytes and Proof Ledger is 1,053,570 bytes. The current status command
prints all 635 rows and expands the historical phase into a very large single
line. The repository parser needs only stable headings, the current row/proof,
and the last same-line active-goal marker.

## Outcome

The repository has one small current program, one small current tracker, and
one immutable history manifest:

1. **Program selects.** It contains only the current phase, ordered candidate
   priorities, selection constraints, archive pointer, and one terminal
   current-authority marker.
2. **Tracker records.** It contains only one active slice, or—when no slice is
   active—the most recently closed slice, its status, a stable closeout link,
   one matching proof row required by the existing parser, and the next-selection
   pointer.
3. **Archive preserves.** It points to the exact pre-compaction Git commit and
   blob objects for both original documents with SHA-256, Git blob OID, bytes,
   line counts, immutable GitHub links, and local `git show` recovery commands.
4. **Future closeouts replace rather than append.** Detailed tests, PR/CI run
   IDs, reviewer chronology, and narratives live in the slice gate/closeout
   document. Current docs store only stable links and compact identities.

## Historical archive contract

Destination:

`docs/plans/history/current-authority/2026-08-16-through-rev-243.manifest.json`

The manifest is machine-readable schema version 1 and must bind:

- repository `interdomestik/interdomestik`;
- source commit `523fda2493ca728dea48241aad5769917f1ad03f`;
- `current-program.md`: 785,382 bytes, SHA-256
  `94842fd5499c79d783023f6248bbd455b0030d82e5b353f4bd686e95d54442e0`,
  Git blob `2725c41c4fe60349c45b82d7fb936d532c088b94`;
- `current-tracker.md`: 1,665,126 bytes, SHA-256
  `b46b861768286d3d616c30cf06082c55b7d9d4971b1d870006441b7a59d26ffa`,
  Git blob `9de470f42e61c5c837bf3db1709cadf38854f19b`;
- last canonical narrative revision `243` and terminal state
  `blocked_requires_current_authority / activeSlice=null`;
- immutable GitHub `blob/<commit>/<path>` links and exact local recovery
  commands for both entries.

The manifest must be content-addressed after materialization. Focused proof must
verify that each declared Git object exists, resolves from the exact source
commit, and reproduces the declared byte count and SHA-256. No historical bytes
are copied into a second 2.45 MB Markdown file.

## Frozen writer map

Maximum repository writer paths:

1. `docs/plans/2026-08-16-ida-dg44-current-authority-operational-compaction.md`
2. `docs/plans/current-program.md`
3. `docs/plans/current-tracker.md`
4. `docs/plans/history/current-authority/2026-08-16-through-rev-243.manifest.json`
5. `scripts/current-authority-format-audit.mjs`
6. `scripts/current-authority-format-audit.test.mjs`
7. `package.json` — only chain the new format audit into existing `plan:audit`;
   no other script or dependency change
8. `scripts/repo-size-budget.json` — conditional deterministic sync only

One writer and one fresh worktree are required after approval. The gate artifact
itself is repository-owned only after exact approval and materialization.

## Operational document schemas

### Current program

Required sections only:

- existing canonical frontmatter;
- `# Current Program` and the authority statement;
- `## Current Phase`;
- `## Ordered Candidate Priorities` with at most 12 rows and no promoted slice
  unless a separately approved design gate says so;
- `## Selection Constraints`;
- `## Historical Authority` with the content-addressed manifest link;
- exactly one final current-authority marker on one physical line.

Hard target: at most 16,384 UTF-8 bytes and 220 lines.

### Current tracker

Required sections only:

- existing canonical frontmatter;
- `# Current Tracker`;
- `## Active Queue` with exactly one row: the active slice or most recently
  closed slice;
- `## Proof Ledger` with exactly one matching row, using stable gate/closeout/
  PR/merge/archive references instead of narrative transcripts;
- `## Next Selection` with exactly one same-line resolver marker;
- `## Historical Authority` with the content-addressed manifest link.

Hard target: at most 12,288 UTF-8 bytes and 160 lines.

Combined live-authority target: at most 28,672 bytes, a reduction of at least
98.8% from 2,450,508 bytes.

## Append-prevention contract

The new focused audit must fail closed when:

- either live document exceeds its byte or line ceiling;
- the program has more than 12 candidate rows or more than one active-goal
  marker;
- the tracker has anything other than one queue row and one same-ID proof row;
- a current document contains raw workflow-log blocks, full runtime transcripts,
  multi-revision appendices, or more than one `Rev` narrative;
- the archive pointer is missing or does not contain the exact manifest SHA;
- the manifest source commit, Git blob OID, byte count, or SHA-256 cannot be
  reproduced;
- program and tracker resolver markers disagree.

The audit is added only to the existing `plan:audit` package command. No GitHub
workflow, job, trigger, runner, validation-surface, E2E, security, Sonar, CodeQL,
finalizer, or deployment behavior changes.

## Acceptance matrix

| Acceptance | Focused evidence | Invalidated by |
| --- | --- | --- |
| Exact historical recovery | new format-audit test reconstructs both source blobs and matches SHA/bytes | source commit/blob/hash/path change |
| Current program is operational | format audit: <=16,384 bytes, <=220 lines, <=12 ordered candidates, one marker | program bytes/schema/marker change |
| Current tracker is operational | format audit: <=12,288 bytes, <=160 lines, one queue row, one same-ID proof row, one marker | tracker bytes/schema/row/marker change |
| Existing parsers remain valid | `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, next-slice resolver | current docs/parser/audit change |
| No evidence loss | old Git blobs reproduce exact declared SHA/bytes and immutable links resolve | archive manifest/source commit change |
| No product/runtime impact | scope audit shows only frozen paths; resolver remains blocked/null | any path outside writer map or active promotion |
| Repository size is deterministic | `node scripts/repo-size-budget-sync.mjs --check` before and deterministic sync/check after staging | tracked inventory change |

Tier 0 proof only: `git diff --check`, focused new audit tests, `pnpm plan:status`,
`pnpm plan:audit`, `pnpm track:audit`, `pnpm docs:verify`, next-slice resolver,
and repository-size check. No build, Docker, browser, E2E, deployment, production,
Brain publication, M6, or M7 proof is authorized or needed.

## Disk and storage impact

- Current working-tree authority shrinks by at least 2,421,836 bytes.
- The manifest and audit code/tests are budgeted at no more than 48 KiB total.
- No 2.45 MB duplicate archive payload is created; historical content remains
  in the two already-existing Git blobs at the exact source commit.
- Expected working-tree net reduction is at least 2.37 MiB.
- Git object storage may grow modestly for the new compact docs/manifest/code,
  but Git delta compression can reuse the existing source blobs. This slice
  does not claim meaningful Mac disk reclamation; its primary benefit is parser,
  review, context, and operational-authority reduction.
- The current-document ceilings bound future per-closeout growth to replacement
  edits. Full CI/runtime detail must go to one per-slice closeout artifact and is
  linked, never copied, into current docs.

## Exclusions and stop conditions

Forbidden:

- product code, product slice selection, product branch/session/runtime;
- `AGENTS.md`, `README.md`, architecture documents or generated Wiki edits;
- `.github/workflows/**`, CI job/trigger/runner/gate semantic changes;
- AI OS/Brain config, controller, publication, graph activation, retention or
  purge;
- proxy/routes/auth/session/tenancy/schema/RLS/billing/deployment/production;
- alteration or deletion of the user-owned infrastructure-roadmap worktree;
- rewriting Git history or deleting historical closeout/design artifacts.

Stop before mutation if main differs from the approved base, AI OS is not
current/clear, source blobs/hashes differ, the existing audit/parser contract
requires a writer outside the frozen map, or lossless reconstruction fails.

## Review disposition

- Repository-contract review: `PASS`. Existing `plan-model.mjs` parses the
  required section headers and tables without requiring historical rows.
  `plan:audit` requires one-to-one queue/proof IDs; the one-row target satisfies
  it. The global resolver needs agreeing same-line terminal markers; the target
  preserves them.
- Senior model review: `skipped` for this Tier 0 candidate under the lean
  workflow. No product, protected surface, runtime, or CI workflow is changed;
  focused parser/audit evidence is the stronger oracle. A model review becomes
  required only if implementation needs a writer or semantic change outside
  this exact contract.
- Sonar, CodeQL, Copilot, security scan, browser and deployment: not applicable
  before a PR; normal repository-required docs-only checks still apply after
  materialization.

## Rollback

Revert the single compaction merge. The two exact historical documents are
recoverable byte-for-byte from commit
`523fda2493ca728dea48241aad5769917f1ad03f` using the manifest's `git show`
commands. Rollback changes no product state, schema, provider, deployment or
AI OS runtime. If the compact parser/audit fails after merge, restore both blobs,
revert the audit/package changes, and return resolver state to the same
blocked/null checkpoint.

## Exact approval hold

Approval authorizes only this Tier 0 compaction gate to be materialized,
reviewed through focused repository proof, opened as one docs/governance PR,
merged only when its exact-head checks and feedback are clean, and closed with
clean/synced main. It does not authorize selecting or implementing the next
product slice.
