# Sentry Seer Sweep (Post-deploy evidence)

## Run context

- Deployment ID:
- Environment:
- Deployment UTC time:
- Evidence directory:
- Release ticket / PR:
- Sentry organization:
- Sentry project:

## Windowed issue sweep

- Window start (UTC): **\_\_\_**
- Window end (UTC): **\_\_\_**
- Scope used in Sentry filter:
  - New issues since deploy: yes/no
  - Minimum severity: **\_\_\_**
  - Environments: production / staging / other

## Query used

```text
Project: <project>
Environment: <env>
Since: <timestamp>
Until: <timestamp>
Status: Unresolved/All
```

## New high-impact issues reviewed

- Issue link:
  - Severity: **\_\_\_**
- Seer summary:
  - Root cause:
  - Suggested fix:
  - Confidence / uncertainty:
  - Follow-up action:

## Sweep summary

- New high-severity issues observed: **\_\_\_**
- Blocker regressions requiring ticket or rollback: **\_\_\_**
- Seer run completed by: **\_\_\_**
- Decision: continue / rollback / monitor

## Evidence attachments

- `logs/sentry-issues-window-pre.md`
- `logs/sentry-issues-window-post.md`
- `notes/seer-findings.md`
