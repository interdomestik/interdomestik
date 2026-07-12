# Task 7: Tier 3 review and delivery

- [ ] Generate the Tier 3 privacy/UI/DB-read gate plan and workflow scorecard.
- [ ] Build a redacted review packet. Run Sonnet 4.6 plus Gemini 3.1 Pro Preview;
      use Opus only for unresolved disagreement or blocked required evidence. Run a
      diff-scoped Codex Security review when available. Fix every real blocker and
      rerun the completed senior route after substantive remediation.
- [ ] Run final mandatory gates once:

```bash
pnpm slice:verify
pnpm ci:local:pr
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

- [ ] If a duplicate lane exits 137 after equivalent gates pass, record
      `local_resource_kill/exit_137`, not a product defect.
- [ ] Open one implementation PR with scope, sources/predicates, qualified copy,
      forbidden-field/browser/a11y proof, reviews, rollback, residual risk, and Tier
      3 human approval.
- [ ] Monitor current-head Copilot, Sonar, CodeQL, gitleaks, audit, E2E, Pilot
      Gate, CI, and threads. Merge only when all evidence SHAs match and findings are
      resolved.
- [ ] After approved merge, update program/tracker and closeout in a scoped PR,
      verify main health and safe live smoke, clean branch/worktree, and leave
      `REC-02` unpromoted.
