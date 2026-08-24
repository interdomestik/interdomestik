# Branch Protection And PR Governance

Use this for the `main` branch protection rule in GitHub.

## Required Status Checks

Require these exact check names:

1. `validation-surface`
2. `audit`
3. `e2e`
4. `pnpm-audit`
5. `gitleaks`
6. `pilot-gate`
7. `pr-finalizer`
8. `commitlint`
9. `delivery-gate`

`delivery-gate` is the additive terminal tuple with GitHub Actions `app_id` `15368`. Activation is
add-only: preserve every existing check tuple and protection flag, then append this tuple only after
its current-head canary is terminal success.

`pilot-gate` is the stable context; its preflight/runner remain evidence. Do not globally require
path-gated `ai-eval`. Do not require `static`, `unit`, or `e2e-gate` globally; validation-surface may
validly skip them.
Do not require `SonarCloud Code Analysis` globally; governance-only materialization is not
deterministic, so monitor it instead.
Do not directly require CodeQL contexts: `delivery-gate` evaluates the canonical generator contract.

## Reviewer And Feedback Monitoring

Run the read-only governance report during PR monitoring:

```bash
pnpm pr:governance:report -- <PR_NUMBER>
```

The governance report records required-check and monitored generator state. `delivery-gate` owns
terminal intake for reviews, inline comments, issue comments, and unsolicited Copilot/Codex
feedback.

Copilot is never requested or waited on. Its absence is not a blocker; every unsolicited finding
still enters terminal feedback intake. Codex GitHub review is expected when enabled, but absence is
recorded instead of blocking indefinitely.

## Protection Settings

Enable:

1. Require a pull request and up-to-date passing status checks.
2. Require conversation resolution.
3. Enforce protections for administrators.
4. Disable force pushes and deletions.

Keep default workflow tokens read-only. Stage action allow-list or SHA-pin changes only when the
current action set is compatible, avoiding CI self-blocking.
