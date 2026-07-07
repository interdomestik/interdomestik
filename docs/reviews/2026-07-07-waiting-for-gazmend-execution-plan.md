---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-07-preparation-only-workstream.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md
  - docs/reviews/2026-07-07-gazmend-return-control-room.md
  - docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
---

# Waiting For Gazmend Execution Plan - 2026-07-07

> Status: preparation-only execution plan. This does not promote `MOB-01b`,
> start runtime work, expose MK Help Now, change app flags/config, or replace
> current-program/current-tracker authority.

## Classification

Classified as `documentation/external-tracker-only` because it coordinates
safe work while reviewer evidence is pending. It touches only review/docs
artifacts and advisory Obsidian memory.

## Current State

| Control                   | Current evidence                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewer portal           | Live at `https://reviewer-ecohub.vercel.app` with Basic Auth                                                                                                 |
| Live smoke                | `401` without auth, `401` wrong auth, `200` correct auth                                                                                                     |
| Persistence               | Vercel Blob draft/submission path proved with fake data and cleaned; correction storage exists, but no correction smoke is recorded unless separately tested |
| Current runtime authority | `activeSlice=null`; `blocked_requires_current_authority`                                                                                                     |
| Worktree posture          | Docs/output preparation artifacts are dirty; no runtime changes                                                                                              |

## What We Should Do While Waiting

| Order | Work                                      | Output                                                                    | Why it helps                                             |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1     | Keep reviewer handoff ready               | URL, credentials, and Albanian instructions available                     | Removes friction for Gazmend                             |
| 2     | Prepare return triage                     | Use `evidence-intake-processor.md` before updating the register           | Prevents accepting incomplete or unsafe evidence         |
| 3     | Pre-mark gate dependencies                | Keep `MOB-DG01B` missing-evidence rows visible                            | Saves time after ENT-A04/A05/A06 returns                 |
| 4     | Prepare correction loop                   | Use portal corrections instead of overwriting old answers                 | Handles changes after 1 month without losing audit trail |
| 5     | Keep UI package separate                  | Record UI/UX findings as blocker/polish/input only                        | Prevents broad UI work from blocking MK evidence intake  |
| 6     | Prepare current-authority packet skeleton | `docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md` | Lets CA+DG move fast after returns                       |
| 7     | Monitor portal health lightly             | Periodic `GET /api/status` with auth if needed                            | Catches access/persistence failure early                 |
| 8     | Use return control-room                   | `docs/reviews/2026-07-07-gazmend-return-control-room.md`                  | Makes the first post-submission response deterministic   |

## What We Must Not Do

- no `apps/web`, `packages`, `supabase`, `scripts`, `README.md`, or `AGENTS.md`
  changes from this waiting lane;
- no `MOB-01b` implementation;
- no MK public Help Now exposure;
- no flag/config flip;
- no fee, billing, handler, or case-runtime implementation;
- no current-program/current-tracker promotion without a separate explicit
  current-authority decision;
- no acceptance of returned evidence without reviewer name, role, date, decision,
  required concrete fields, and safe evidence reference.

## Trigger When Gazmend Submits

When a portal submission appears:

1. Open `docs/reviews/2026-07-07-gazmend-return-control-room.md`.
2. Read only the returned JSON summary and attachment metadata first.
3. Confirm no sensitive file was uploaded; if it was, move handling outside repo
   and record only an evidence-center reference.
4. Classify each item as `accepted`, `returned_for_correction`, `blocked`,
   `needs_instrumentation`, or `superseded`.
5. Append a row to `docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`.
6. Update `MOB-DG01B` only if ENT-A04/A05/A06 evidence is accepted.
7. If all required blockers clear, complete
   `docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md`
   and request a current-authority/design-gate decision for exactly `MOB-01b`.

## Immediate Recommendation

Continue this waiting lane until Gazmend returns evidence. The only next work
that should happen before his return is process hardening, evidence triage
readiness, and portal/Obsidian synchronization.

Runtime development should remain blocked.
