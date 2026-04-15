# Pilot Executive Review Template

Copy this file to `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md` for `PD07`.

This is the canonical Day 7 executive review artifact for a bounded pilot line.

Use it together with:

- `docs/pilot/PILOT_GO_NO_GO.md`
- `docs/pilot/V1_0_0_EXECUTIVE_DECISION_GATE.md`
- `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<pilot-id>.md`

## Header

- Pilot ID:
- Date (`YYYY-MM-DD`):
- Review owner:
- Branch scope:
- Mode (`rehearsal`/`live`):
- Narrow objective:
- Stop date or explicit end condition:

## Source Evidence

- Copied evidence index:
- Day 7 daily sheet:
- Latest release report:
- Week-1 KPI / SLA rollup:
- Rollback target if applicable:

## Cumulative Review

- Release and artifact custody:
- Reset-gate status:
- Role-chain status:
- SLA and matter status:
- Privacy, RBAC, and multi-tenant status:
- Communications and incident status:
- Branch-manager recommendation summary:
- Admin decision summary:

## Decision Gate Questions

Answer each directly.

1. What was the narrow objective of this pilot window?
2. Did the window stay clean without post-hoc repair?
3. Did `2 Operating-Day Progression Rate` improve enough to change the recommendation?
4. Did the Day 5 privacy / RBAC rerun pass on the corrected baseline?
5. Why is `repeat_with_fixes` or `expand` justified now?
6. What exact stop date or end condition applies if the answer is not `expand`?

## Recommendation

- Final recommendation (`expand`/`repeat_with_fixes`/`pause`/`stop`):
- Canonical day-7 decision (`continue`/`pause`/`hotfix`/`stop`):
- Recommended final review sentence:
  - `The v1.0.0 pilot window is sufficient for <pause|repeat_with_fixes|expand> because <specific evidence>, and it remains bounded by <stop date or end condition>.`
- Rationale:

## Required Follow-Up

- Owner:
- Deadline:
- Action:

## Linked Evidence

- Observability references:
- Decision references:
- Memory advisory retrievals reviewed:
- New memory candidate captures from this pilot:
