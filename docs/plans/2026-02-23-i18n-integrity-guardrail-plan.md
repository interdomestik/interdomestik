# I18n Integrity Guardrail Plan

Status: Active (non-regression mode)
Start date: 2026-02-23

## Objective

Prevent any new mixed-language regressions across `en`, `sq`, `mk`, and `sr` while preserving delivery momentum for the bulletproof program.

## Scope

- Message namespace parity and key parity are enforced by `pnpm i18n:check`.
- Mixed-language non-regression is enforced by `pnpm i18n:purity:check`.
- Existing translation debt is tracked in baseline and burned down incrementally.

## Safety Constraints (to avoid disrupting bulletproof execution)

1. Use baseline non-regression mode first; do not block on historical debt.
2. Fail only when new EN-equal strings are introduced in non-EN locales.
3. Keep remediation PRs small (one locale/namespace slice at a time).

## Enforcement

1. Local/PR command path:
   - `pnpm i18n:check`
   - `pnpm i18n:purity:check`
2. CI alert path:
   - Workflow `CI` static job runs both checks.
   - Purity report artifact is uploaded from `tmp/i18n-purity/`.
3. RC alert path:
   - `release-candidate.yml` i18n gate runs both checks.
   - RC logs include `i18n-purity-report.json`.

## Baseline Model

- Baseline file: `scripts/i18n-purity-baseline.json`
- Baseline captures known EN-equal string entries in non-EN locales.
- Purity check fails only on entries that are not in baseline.

## Regression Response Playbook

When CI/RC fails on i18n purity regression:

1. Open artifact/report and identify newly introduced entries.
2. Revert the offending locale changes in the PR branch.
3. Re-run:
   - `pnpm i18n:check`
   - `pnpm i18n:purity:check`
4. If a value must intentionally stay equal to EN, make a dedicated i18n debt decision PR (do not silently bypass in feature PR).
5. If the checker behavior itself is incorrect, rollback by reverting checker wiring commit and open a follow-up fix PR.

## Debt Burn-down

1. Fix highest-impact namespaces first (`common`, `nav`, `auth`, `pricing`, dashboard/admin namespaces).
2. After each debt PR, regenerate baseline only if the reduction is intentional:
   - `pnpm i18n:purity:baseline`
3. Keep baseline changes explicit and reviewable.

## Exit to Strict Mode (post debt burn-down)

Switch from baseline mode to strict mode only when baseline reaches near-zero and product owners approve fully native locale quality as a hard gate.
