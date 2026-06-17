# Branch Protection And PR Governance

Use this for the `main` branch protection rule in GitHub.

## Required Status Checks

Require these exact check names:

1. `validation-surface`
2. `audit`
3. `static`
4. `unit`
5. `e2e-gate`
6. `e2e`
7. `pnpm-audit`
8. `gitleaks`
9. `pilot-gate`
10. `pr-finalizer`
11. `commitlint`
12. `SonarCloud Code Analysis`
13. `CodeQL`
14. `Analyze (actions)`
15. `Analyze (javascript-typescript)`

`Pilot Gate Preflight` and `Pilot Gate Runner` are monitored as evidence, but
`pilot-gate` is the stable branch-protection context. Do not require `ai-eval`
globally because it is path-gated and validly skipped for non-AI PRs.

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
