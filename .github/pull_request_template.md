## What changed

## Why

## Risk (tenant/auth/db/proxy/UI)

## How tested

- [ ] pnpm pr:verify (exit `___`)
- [ ] pnpm e2e:gate (exit `___`, `___` passed, `___` skipped)
- [ ] Additional unit tests run (list commands + exits)

## Evidence

- tmp/pilot-evidence/dayXX/<timestamp>/... (commands, logs, screenshots, network captures)
- logs/sonar-scan.log
- logs/sonar-qualitygate.json
- notes/sonar-summary.md
- `PR-<number>-sonar-quality-gate` artifact included (if run in CI)
- Sentry pre/post window files:
  - logs/sentry-issues-window-pre.md
  - logs/sentry-issues-window-post.md
  - notes/seer-findings.md

- [ ] Sonar scan ran (attach log in `logs/sonar-scan.log`)
- [ ] Quality gate status: `OK | ERROR` (attach `logs/sonar-qualitygate.json`)
- [ ] New Vulnerabilities on changed code: `0` (or list exceptions)

## Rollback

- Revert commit / disable feature flag / restore migration path
