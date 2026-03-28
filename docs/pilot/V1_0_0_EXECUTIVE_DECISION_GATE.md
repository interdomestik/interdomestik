# v1.0.0 Executive Decision Gate

This document implements the explicit executive decision requirement for any continuation beyond the bounded `v1.0.0` pilot window.

Use it together with:

- `docs/pilot/PILOT_EXEC_REVIEW_TEMPLATE.md`
- `docs/pilot/scenarios/PD07-executive-review.md`
- `docs/pilot/V1_0_0_PILOT_ENTRY_PACKAGE.md`
- `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`

## Rule

No one may infer expansion from:

- a successful `v1.0.0` tag
- a green release gate
- a passed readiness cadence check
- a good week of pilot operation

Expansion or unbounded continuation requires an explicit executive review artifact for the new pilot id.

## Required Decision Options

The executive review must choose one and only one of these:

- `pause`
- `continue_bounded`
- `expand`
- `stop`

## Minimum Evidence For `continue_bounded`

`continue_bounded` is allowed only if:

1. the new pilot id has a complete canonical evidence trail
2. no Sev1 incident exists
3. privacy / RBAC rerun is green
4. evidence custody stayed clean without repair
5. a narrow objective and end condition are written explicitly

## Minimum Evidence For `expand`

`expand` is allowed only if:

1. the new pilot id is evidence-complete
2. no Sev1 or unresolved Sev2 older than one operating day exists
3. privacy / RBAC rerun is green
4. triage and public update SLA remain within threshold
5. `2 Operating-Day Progression Rate` is no longer the known weak point
6. the review states why expansion is justified now when previous canonical reviews said `no`

## Required Executive Review Additions

Any new `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md` used for this gate must answer these directly:

1. What was the narrow objective of the `v1.0.0` pilot window?
2. Did the window stay clean without post-hoc repair?
3. Did `2 Operating-Day Progression Rate` improve enough to change the recommendation?
4. Did the Day 5 privacy / RBAC rerun pass on the corrected baseline?
5. Why is bounded continuation or expansion justified now?
6. What exact stop date or end condition applies if the answer is not `expand`?

## Recommended Final Review Sentence

Use a sentence with this structure in the new executive review:

`The v1.0.0 pilot window is sufficient for <pause|bounded continuation|expansion> because <specific evidence>, and it remains bounded by <stop date or end condition>.`
