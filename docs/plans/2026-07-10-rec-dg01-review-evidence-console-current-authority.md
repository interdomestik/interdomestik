---
plan_role: input
status: active
source_of_truth: false
owner: platform + product-design + qa
last_reviewed: 2026-07-10
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/superpowers/specs/2026-07-09-review-evidence-console-design.md
  - docs/superpowers/plans/2026-07-09-review-evidence-console.md
---

# REC-DG01 Current Authority: Local Review & Evidence Console

> Status: approved current-authority/design-gate.
> Promotes exactly one non-runtime implementation slice: `REC-01`.

## Resolver Input

Before this gate, the canonical resolver returned
`blocked_requires_current_authority` with `activeSlice=null`. AI OS retrieval was
current and supplied advisory repo instructions; the repo tracker remains the
execution authority.

## Promoted Slice

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Slice   | `REC-01`                                                      |
| Class   | implementation                                                |
| Risk    | Tier 2 standalone internal UI workflow                        |
| Root    | `tools/review-evidence-console/`                              |
| User    | Assigned internal reviewer using repo-safe fixture packets    |
| Outcome | Complete one packet and produce a deterministic local receipt |

The next active governed implementation goal is exactly one canonical tracker
slice: `REC-01`.

## Existing Work Disposition

Three console commits (`da8f68b3`, `995afaf3`, `b5e1df8e`) and paused fixture
remediation predate this canonical gate. They are preserved as quarantined
implementation evidence, not retroactive authorization or acceptance. No new
implementation may proceed until this gate is approved. After promotion, each
existing change must pass the same scope, test, security, and review obligations
as new `REC-01` work.

## Scope

- loopback-only static server bound to `127.0.0.1`;
- reviewer fixture inbox, guided packet workspace, validation summary, and receipt;
- static JSON fixture packets with operational, non-sensitive text only;
- localStorage drafts, conflict detection, recovery export, and explicit deletion;
- deterministic application-level write-once, tamper-evident receipt versions;
- exact proof at 1440x1000, 1024x768, 390x844, and 320x720 plus 200% zoom;
- semantic HTML, keyboard/focus behavior, live regions, reduced motion, and 44px targets;
- visual comparison using `/tmp/interdomestik-reviewer-audit/` as reference and
  `/tmp/interdomestik-rec01-visual-proof/` as implementation evidence;
- no deployment within `REC-01`.

## Hard Boundary

`REC-01` does not authorize production runtime integration. It must not touch:

- `apps/web/**`, `apps/web/src/proxy.ts`, canonical routes, or clarity markers;
- authentication, identities, assignment authorization, tenancy, or permissions;
- customer, member, claim, medical, legal, billing, or uploaded document data;
- uploads, Vercel Blob, databases, schema, migrations, RLS, APIs, queues, or webhooks;
- external writes or deployment;
- README, AGENTS, architecture documents, or unrelated product work.

## Evidence Contract

| Acceptance       | Authoritative proof                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| fixture boundary | bundled reviewer, assignment, and packet JSON plus normalization tests                                                                    |
| safe input       | heuristic guard tests for specified sensitive patterns plus synthetic/repo-safe operating constraints                                     |
| drafts           | localStorage adapter tests for keys, conflicts, recovery, quota, and deletion                                                             |
| receipts         | canonical JSON, SHA-256 ID, write-once behavior, hash verification on load/export/import, correction, nested-mutation, and deletion tests |
| workflow         | session/controller and DOM tests plus browser proof for the four primary states                                                           |
| accessibility    | focus, labels, landmarks, live-region, keyboard, zoom, and target-size checks                                                             |
| isolation        | scope audit against the exact authorized-path allowlist below                                                                             |

Authorized tracked paths are limited to:

- `tools/review-evidence-console/**`;
- this gate, `docs/plans/current-program.md`, and `docs/plans/current-tracker.md`;
- the approved console design spec and implementation plan;
- `scripts/repo-size-budget.json` only for measured slice-owned inventory drift.

`.superpowers/` is preserved as ignored local brainstorming evidence and is not
part of the slice, commit, PR, deployment, or scope claim.

No receipt grants Interdomestik execution authority. It records local review
evidence only and carries an explicit authority disclaimer.

## Failure And Operations

- Missing or malformed fixtures render an unavailable state without data fallback.
- Corrupt/incompatible drafts remain exportable until the reviewer deletes them.
- Cross-tab conflicts stop autosave and require explicit reviewer resolution.
- Import reads a local `.json` file with `File.text()` and performs no upload.
- Free-text guards cannot prove prose is non-sensitive; labels and fixtures require
  synthetic operational text, and structured allowlists are used where prevention
  is required.
- The server allows `GET` and `HEAD` only, uses an extension allowlist, and sends a
  CSP with `connect-src 'none'`.
- There are no production alerts, queues, support runbooks, or durable external stores.

## Verification

1. Observe every focused test fail for the missing behavior before implementation.
2. Run all console Node tests and syntax checks.
3. Enforce 150-line source/test limits and 200-line fixture limits only where the
   repo guard explicitly permits them; otherwise split files.
4. Run repo size sync/check for slice-owned inventory.
5. Assert measured overflow/44px targets at every exact viewport, 200% zoom and
   text spacing, automated WCAG 2.2 AA, keyboard/focus/reading order, and paired
   reference/implementation screenshots.
6. Run `pnpm slice:verify`, browser/accessibility proof, `pnpm pr:verify`,
   `pnpm security:guard`, and `pnpm e2e:gate`.
7. Record unrelated gate/environment failures without widening the slice.

## Reviewer Matrix

Required coverage: architecture/current authority, security/input/persistence,
QA/test evidence, product/mobile/accessibility, and bounded senior review.

Reviewer status: external routes were unavailable, then an isolated independent
review approved the remediated gate with no blocker or important findings.

## Rollback And Stop Conditions

Rollback first clears named local draft/receipt keys through the console, then
removes `tools/review-evidence-console/`; removing files alone cannot erase browser
storage. It cannot alter product runtime state. Stop and return to authority if
implementation needs any excluded surface, real identity/customer data, upload,
network write, production authentication, database, or production deployment.

Deployment, if requested after `REC-01` approval, is a separate operation. It
requires a console-root `.vercel/project.json` whose project name is exactly
`reviewer-ecohub`, must not alter the repo-root `interdomestik-web` link or env,
must use preview mode without `--prod`, must prove protected access and unchanged
production aliases, and must record exact preview-deletion rollback.

## Decision

`REC-DG01` promotes `REC-01` only; `MOB-03a`, full `MOB-03`, and all production
runtime slices remain unpromoted.
