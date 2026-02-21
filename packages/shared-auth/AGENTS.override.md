# AGENTS.override — shared-auth package (high-risk)

## Purpose

Keep shared authentication contracts stable and prevent cross-boundary security drift from reaching application packages.

## Allowed changes

- Changes only for explicit security or contract updates approved by Atlas + Sentinel.
- Keep edits minimal and include interface tests where contracts are affected.
- Require migration-independent evidence for auth/session behavior adjustments.

## Forbidden changes

- No session/auth contract widening without explicit approval.
- No auth trust-model edits or bypasses.
- No changes that alter tenant/session assumptions without full security review.

## Required tests

- Contract tests for session/auth surfaces touched.
- Regression tests for role resolution and tenant binding.
- Evidence with command output and pass criteria.

## Hard-stop signatures

- Session claim mismatch.
- tenant binding missing.
- auth boundary bypass or role privilege drift.
- unexpected auth failure spikes.

## Escalation rule

- If change impacts session, tenant binding, or role semantics, halt and request Atlas + Sentinel review before code progression.

Any change requires:

- Sentinel approval,
- explicit Slice Exception in PR guardrails,
- security rationale in Evidence section.
