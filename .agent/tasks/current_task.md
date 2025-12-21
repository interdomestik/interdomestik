---
task_name: 'Email notifications (dunning emails Day 0, 7, 13)'
task_type: 'Feature'
priority: 'P1-High'
estimate: '4h'
test_level: 'unit'
roadmap_ref: 'Phase 1: Membership Infrastructure'
branch: 'feat/paddle-subscription-integration'
start_time: '2025-12-21T13:52:43+01:00'
baseline:
  lint: 'pending'
  typecheck: 'pass'
  tests: 'pending'
  format: 'n/a'
  log: 'n/a'
---

# 🚀 Current Task: Email notifications (dunning emails Day 0, 7, 13)

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Email notifications (dunning emails Day 0, 7, 13)</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>4h</estimate>
  <branch>feat/paddle-subscription-integration</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a member with a failed payment, I want to receive email reminders
  so that I can update my payment method before losing access.
</user_story>

<acceptance_criteria>
  - [ ] Day 0: Send immediate email when payment fails
  - [ ] Day 7: Send reminder email (7 days left)
  - [ ] Day 13: Send final warning email (1 day left)
  - [ ] Track emails sent to avoid duplicates
  - [ ] Use existing Resend email provider
</acceptance_criteria>

<technical_context>
  - Email provider: Resend (already configured)
  - Email templates: apps/web/src/lib/email-templates.ts
  - Email sender: apps/web/src/lib/email.ts
  - Webhook: apps/web/src/app/api/webhooks/paddle/route.ts
</technical_context>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [ ] **Planning**: Create a step-by-step implementation plan
- [ ] **Implementation**: Execute code changes
- [ ] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [ ] Unit tests added: `src/**/*.test.ts`
- [ ] Tests use factories from `src/test/factories.ts`
- [ ] Run: `pnpm test:unit`
- [ ] All tests pass

## ✅ Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests pass at required level (unit)
- [ ] `pnpm lint` passes (or no new errors)
- [ ] Formatter/Prettier check passes
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [ ] Risks identified (perf, reliability, UX, security, data)
- [ ] Rollback/mitigation plan documented
- [ ] Monitoring/logging impact considered
- [ ] Migrations include up/down and backfill strategy (if applicable)
- [ ] Accessibility checks for UI changes
- [ ] Removed debug artifacts (console.log/debugger/TODO left behind)
- [ ] New/updated strings added to locales and `pnpm i18n:check` run (if applicable)
- [ ] New components kept small; split view vs hooks/logic; co-located tests/stories added
- [ ] Oversized file remediation noted (if any)

## 🧩 New Components & Files Checklist

- [ ] File size under limits (soft 250 lines, hard 400); split view vs logic/hooks if larger
- [ ] Co-located test (`*.test.tsx`) and story/demo (if using Storybook/MDX)
- [ ] i18n keys added for any new UI strings
- [ ] Accessibility verified (labels/roles/focus)
- [ ] Imported shared styles/components (@interdomestik/ui) where applicable

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [ ] All checkboxes above are checked (DoD, Senior, New Components)
- [ ] Required tests/QA in this task file have been executed and are green
- [ ] No unchecked items remain in this file (if not applicable, explicitly mark N/A)
- [ ] current_task is only marked complete after verifying every required checkbox

## � Related Files

- apps/web/src/lib/email.ts (Resend email sender)
- apps/web/src/lib/email-templates.ts (Email template functions)
- apps/web/src/app/api/webhooks/paddle/route.ts (Webhook handler)
- packages/database/src/schema.ts (subscriptions table)
- .env (RESEND_API_KEY)

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

### Email Schedule

| Day | Trigger                        | Content                         |
| --- | ------------------------------ | ------------------------------- |
| 0   | Webhook: subscription.past_due | "Payment failed, update now"    |
| 7   | Cron/Scheduled job             | "7 days left to update payment" |
| 13  | Cron/Scheduled job             | "FINAL WARNING: 1 day left"     |

### Approach Options

1. **Webhook-only (Day 0)**: Immediate email on past_due event
2. **Cron job (Day 7, 13)**: Scheduled job to check grace periods
3. **Alternative**: Use email provider's scheduled/delayed sends

## 🔬 QA Baseline (at task start)

| Metric     | Status  |
| ---------- | ------- |
| Lint       | pending |
| Type Check | pass    |
| Unit Tests | pending |
| Format     | n/a     |
| Coverage   | skipped |
| Log        | n/a     |

## 📏 Oversized Files (>400 lines or >15000 bytes)

None detected

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

Changed files are within limits

---

## � PR Template (Copy when done)

```markdown
## What

Email notifications (dunning emails Day 0, 7, 13)

## Why

Phase 1: Membership Infrastructure

## How

<!-- Implementation approach -->

## Testing

- [ ] Unit tests pass (`pnpm test:unit`)
- [ ] E2E tests pass (`pnpm test:e2e`)
- [ ] Manual QA completed
- [ ] No regressions in existing functionality

## Screenshots (if UI changes)

<!-- Add screenshots here -->

## Notes to Reviewer

<!-- Highlight areas needing careful review, known limitations, or follow-up tasks -->
```
