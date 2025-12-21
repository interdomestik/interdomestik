---
task_name: 'Membership gate on claim filing (Restrict access if not active)'
task_type: 'Feature'
priority: 'P1-High'
estimate: '2h'
test_level: 'unit'
roadmap_ref: 'Phase 1: Membership'
branch: 'feat/paddle-subscription-integration'
start_time: 'Sun Dec 21 14:10:59 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_141046.log'
---

# 🚀 Current Task: Membership gate on claim filing (Restrict access if not active)

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Membership gate on claim filing (Restrict access if not active)</objective>
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
  As a business owner, I want to ensure only active members can file claims
  so that the service is exclusive to paying customers.
</user_story>

<acceptance_criteria>
  - [ ] Identify Claim Wizard page/route
  - [ ] Implement membership check logic (Active, Trialing, Past Due + Grace Period = Allowed)
  - [ ] Redirect non-members to `/pricing` with a message or show a "Membership Required" empty state
  - [ ] Protect `submitClaim` server action to prevent API bypass
  - [ ] Display "Active Membership Required" warning if blocked
</acceptance_criteria>

<technical_context>
  - Subscription table: `status`, `gracePeriodEndsAt`
  - Allowed statuses: 'active', 'trialing'
  - Conditional allowed: 'past_due' IF `now < gracePeriodEndsAt`
  - Blocked: 'paused', 'canceled', 'past_due' (expired), or null
</technical_context>
```

## 🏗️ Status Tracker

- [ ] **Exploration**: Locate wizard page and submit action
- [ ] **Planning**: Define `hasActiveMembership` helper
- [ ] **Implementation**: Add gate to page and action
- [ ] **Verification**: Verify protection
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

- apps/web/src/app/[locale]/(app)/dashboard/claims/new/page.tsx (or similar)
- apps/web/src/actions/claims.ts
- packages/database/src/schema.ts
- apps/web/src/lib/subscription.ts (helper to be created?)

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | pass                                                                                           |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Coverage   | skipped                                                                                        |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_141046.log |

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

Membership gate on claim filing (Restrict access if not active)

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
