---
task_name: 'Subscription logic (Paddle)'
task_type: 'Feature'
priority: 'P1-High'
estimate: '2h'
test_level: 'unit'
roadmap_ref: 'Phase 1: Membership'
branch: 'feat/paddle-subscription-integration'
start_time: 'Sun Dec 21 15:22:55 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_152255.log'
---

# 🚀 Current Task: Subscription logic (Paddle)

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Implement Manage Subscription flow (Cancel, Update Payment)</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
  <branch>feat/paddle-subscription-integration</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Use Paddle API via server actions
    - i18n support
  </constraints>
</task_definition>

<user_story>
  As a member, I want to manage my subscription (cancel/update payment)
  so that I have control over my billing.
</user_story>

<acceptance_criteria>
  - [x] Create `cancelSubscription` server action
  - [x] Create `ManageSubscriptionButton` dropdown component
  - [x] Integrate into Membership Page
  - [x] Add translations (Cancel, Confirmations)
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Review Membership Page and Paddle capabilities
- [x] **Planning**: Design cancel action and Manage dropdown
- [x] **Implementation**: Server action, Client Component, i18n
- [x] **Verification**: Unit tests for action
- [x] **Documentation**: Self-documenting code

## 🧪 Testing Checklist

- [x] Unit tests added: `src/actions/subscription.test.ts`
- [x] Run: `pnpm test:unit`
- [x] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (unit)
- [x] `pnpm lint` passes
- [x] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] Screenshots added (N/A)
- [x] Documentation updated (N/A)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [x] Risks identified (Cancellation logic needs careful billing period handling - set activeFrom next_period)
- [x] Rollback/mitigation plan documented
- [x] Monitoring/logging impact considered (Logs cancellation errors)
- [x] New/updated strings added to locales

## 🧩 New Components & Files Checklist

- [x] File size under limits
- [x] Co-located test added
- [x] i18n keys added

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [x] All checkboxes above are checked
- [x] Required tests/QA in this task file have been executed and are green
- [x] No unchecked items remain in this file
- [x] current_task is only marked complete after verifying every required checkbox

## 🔗 Related Files

- apps/web/src/actions/subscription.ts
- apps/web/src/app/[locale]/(app)/dashboard/membership/components/manage-subscription-button.tsx
- apps/web/src/app/[locale]/(app)/dashboard/membership/page.tsx

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

- Implemented `cancelSubscription` action using `paddle.subscriptions.cancel`.
- Created `ManageSubscriptionButton` dropdown to consolidate actions.
- Added i18n strings for Cancellation flow.

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | pass                                                                                           |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Coverage   | skipped                                                                                        |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_152255.log |

---

## 📝 PR Template (Copy when done)

```markdown
## What

Implement Manage Subscription flow (Cancel, Update Payment)

## Why

Phase 1: Membership

## How

- Added `cancelSubscription` server action
- Added `ManageSubscriptionButton`
- Updated Membership page

## Testing

- [x] Unit tests pass (`src/actions/subscription.test.ts`)
```
