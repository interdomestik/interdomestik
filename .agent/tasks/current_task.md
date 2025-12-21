---
task_name: "Paddle customer portal link (for 'Update Payment Method' button)"
task_type: 'Feature'
priority: 'P1-High'
estimate: '2h'
test_level: 'unit'
roadmap_ref: 'Phase 1: Membership'
branch: 'feat/paddle-subscription-integration'
start_time: 'Sun Dec 21 14:05:09 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_140456.log'
---

# 🚀 Current Task: Paddle customer portal link (for 'Update Payment Method' button)

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Paddle customer portal link (for 'Update Payment Method' button)</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
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
  As a member with a failed payment or expired card, I want to click "Update Payment Method"
  so that I can easily update my billing details via Paddle's secure portal.
</user_story>

<acceptance_criteria>
  - [ ] Implement Server Action to get/generate payment update URL for a subscription
  - [ ] Connect "Update Payment Method" button on Membership page to this action
  - [ ] Connect "Update Payment" button in Email Templates (if dynamic links supported) or redirect to dashboard
  - [ ] Handle errors gracefully (e.g., if link generation fails)
</acceptance_criteria>

<technical_context>
  - Paddle Node SDK: Use `paddle.subscriptions.get()` or similar to retrieve `management_urls` if available
  - Or generate a transaction for updating payment method
  - Alternative: Use `paddle.subscriptions.getPaymentMethodChangeTransaction(subscriptionId)`
</technical_context>
```

## 🏗️ Status Tracker

- [ ] **Exploration**: specific Paddle API for payment update
- [ ] **Planning**: Design the Server Action
- [ ] **Implementation**: Server Action + UI integration
- [ ] **Verification**: Manual test
- [ ] **Documentation**: Update docs

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

## 🔗 Related Files

- apps/web/src/app/[locale]/(app)/dashboard/membership/page.tsx
- apps/web/src/actions/subscription.ts (to be created/updated)
- apps/web/src/app/api/webhooks/paddle/route.ts
- packages/database/src/schema.ts

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

Paddle Billing API: `paddle.subscriptions.getPaymentMethodChangeTransaction(subscriptionId)` creates a transaction object that can be used to render a checkout for updating payment details.
OR `management_urls` on subscription object (legacy?). Paddle Billing usually prefers the transaction approach.

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | pass                                                                                           |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Coverage   | skipped                                                                                        |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_140456.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 937 lines, 26696 bytes)
- apps/web/src/app/[locale]/admin/users/[id]/page.tsx ( 366 lines, 15335 bytes)
- apps/web/src/app/[locale]/(agent)/agent/users/[id]/page.tsx ( 377 lines, 15641 bytes)
- apps/web/src/actions/claims.ts ( 429 lines, 11738 bytes)
- packages/database/src/schema.ts ( 658 lines, 22091 bytes)

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

Changed files are within limits

---

## 📝 PR Template (Copy when done)

```markdown
## What

Paddle customer portal link (for 'Update Payment Method' button)

## Why

Phase 1: Membership

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
