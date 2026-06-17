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
9. `CodeQL`
10. `Analyze (actions)`
11. `Analyze (javascript-typescript)`

`Pilot Gate Preflight` and `Pilot Gate Runner` are monitored as evidence, but
`pilot-gate` is the stable branch-protection context. Do not require `ai-eval`
globally because it is path-gated and validly skipped for non-AI PRs.
Do not require `static`, `unit`, or `e2e-gate` globally because they are
validation-surface gated and validly skipped for non-product PRs. Do not require
`SonarCloud Code Analysis` globally because Sonar materialization is not
deterministic across governance-only commits; the governance report still
records its presence, absence, and result.

## Reviewer And Feedback Monitoring

Run the read-only governance report during PR monitoring:

```bash
pnpm pr:governance:report -- <PR_NUMBER>
```

The report must explicitly record:

- required-check state;
- SonarCloud state;
- CodeQL state;
- Copilot review presence or absence;
- Codex review/comment presence or absence.

Copilot review is expected but not deterministic. Codex GitHub review is
expected when enabled, but absence must be recorded instead of blocking
indefinitely.

## Protection Settings

Enable:

1. Require a pull request before merging.
2. Require status checks to pass before merging.
3. Require branches to be up to date before merging.
4. Require conversation resolution before merging.
5. Enforce protections for administrators.
6. Disable force pushes and deletions.

Default workflow token permissions should remain read-only. Action allow-list or
SHA-pinning changes must be staged only when the current workflow action set is
compatible, otherwise the setting can self-block CI.
