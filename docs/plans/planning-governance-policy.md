# Planning Governance Policy

## Purpose

This policy eliminates competing live plans. The repository may contain many planning documents, but it may only have one active execution plan, one active tracker, and one active execution log.

## Canonical Artifacts

The repository must maintain exactly these active sources of truth:

1. `docs/plans/current-program.md`
   Defines current phase, committed priorities, sequencing, and decision authority.
2. `docs/plans/current-tracker.md`
   Defines the active work queue, status, owners, and exit criteria.
3. One active execution log document
   Records append-only implementation evidence and decisions.

Everything else is either an input or a historical artifact.

## Document Roles

Governed documents use front matter with these roles:

- `canonical_plan`: the only document allowed to define current program direction
- `tracker`: the only document allowed to define active execution status
- `execution_log`: the append-only evidence log for current execution
- `input`: recommendation, assessment, or constraint document

Allowed statuses:

- `active`
- `superseded`
- `archived`
- `draft`

## Required Front Matter

Every governed planning document must declare:

```yaml
---
plan_role: canonical_plan | tracker | execution_log | input
status: active | superseded | archived | draft
source_of_truth: true | false
owner: <owner-name>
last_reviewed: YYYY-MM-DD
superseded_by: <path-if-needed>
---
```

Rules:

- `source_of_truth: true` is allowed only for the active `canonical_plan`, active `tracker`, and active `execution_log`.
- `superseded_by` is required when `status: superseded`.
- Non-authoritative documents must show a visible `> Status:` banner near the top.

## Change Control

Recommendations do not become active work by being written down.

Use this path:

1. Assessment or strategy doc proposes a change.
2. Owner triages the proposal.
3. If accepted, the item is copied into `current-program.md` and `current-tracker.md`.
4. Execution evidence lands in the active execution log.

If a recommendation is not copied into the canonical plan and tracker, it is not committed work.

## Writing Rules

- Only `current-program.md` may define `current phase`, `priority order`, or `blocked until`.
- Only `current-tracker.md` may define active item status.
- Input documents may explain or recommend, but they may not redefine live priorities.
- Superseded documents stay in the repo for history, but they must point to their successor.

## Audit

The repository enforces this policy with:

```bash
pnpm plan:audit
```

The repository exposes current live status through:

```bash
pnpm plan:status
```

Legacy status commands may remain for historical documents, but they must print a deprecation notice and point to `pnpm plan:status`.

If `.agent/tasks/current_task.md` exists, it must be marked as superseded local context and must point readers to `pnpm plan:status` and `docs/plans/current-tracker.md`.

The audit fails when:

- more than one active canonical plan exists
- more than one active tracker exists
- more than one active execution log exists
- a superseded governed doc omits `superseded_by`
- a source-of-truth flag appears on a non-canonical role
- an active input document still presents live execution markers

CI must run `pnpm plan:audit` in the audit lane.
