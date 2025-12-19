---
task_name: 'Implement User-Agent Relationship & Auto-Assignment - Centraized Pool'
task_type: 'Feature'
priority: 'P1-High'
estimate: '4h'
test_level: 'full'
roadmap_ref: ''
branch: 'implement-user-agent-relationship-auto-assignment'
start_time: 'Fri Dec 19 17:54:26 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251219_175416.log'
---

# 🚀 Current Task: Implement User-Agent Relationship & Auto-Assignment - Centraized Pool

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Implement User-Agent Relationship & Auto-Assignment - Centraized Pool</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>4h</estimate>
  <branch>implement-user-agent-relationship-auto-assignment</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As an Agent, I want new Users I refer to be automatically linked to me,
  And for their resulting Claims to be automatically assigned to me,
  so that I can manage their cases immediately without Admin intervention.
</user_story>
<acceptance_criteria>
  - [ ] Database: `user` table has `agentId` foreign key.
  - [ ] Auth/Admin: Admins can assign an Agent to a User via 'User Management'.
  - [ ] Logic: When a User with an `agentId` creates a Claim, `claim.agentId` is automatically set to that Agent.
  - [ ] Logic: If User has NO `agentId`, Claim remains unassigned (null).
  - [ ] UI: Admin Users table shows 'Assigned Agent' column and allows editing.
  - [ ] Test: E2E test verifying the flow: User with Agent -> New Claim -> Claim Assigned.
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [x] Unit tests added: `src/**/*.test.ts`
- [x] Component tests added: `src/**/*.test.tsx`
- [x] E2E tests added: `e2e/*.spec.ts`
- [x] Tests use factories from `src/test/factories.ts`
- [x] E2E uses fixtures from `e2e/fixtures/`
- [x] Run: `pnpm qa` (includes all)
- [x] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (full)
- [x] `pnpm lint` passes (or no new errors)
- [x] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] (Recommended) `pnpm qa:full` or full checks executed before PR
- [x] Screenshots added for UI changes (if applicable)
- [x] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [x] Risks identified (perf, reliability, UX, security, data)
- [x] Rollback/mitigation plan documented
- [x] Monitoring/logging impact considered
- [x] Migrations include up/down and backfill strategy (if applicable)
- [x] Accessibility checks for UI changes
- [x] Removed debug artifacts (console.log/debugger/TODO left behind)
- [x] New/updated strings added to locales and `pnpm i18n:check` run (if applicable)
- [x] New components kept small; split view vs hooks/logic; co-located tests/stories added
- [x] Oversized file remediation noted (if any)

## 🧩 New Components & Files Checklist

- [x] File size under limits (soft 250 lines, hard 400); split view vs logic/hooks if larger
- [x] Co-located test (`*.test.tsx`) and story/demo (if using Storybook/MDX)
- [x] i18n keys added for any new UI strings
- [x] Accessibility verified (labels/roles/focus)
- [x] Imported shared styles/components (@interdomestik/ui) where applicable

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [x] All checkboxes above are checked (DoD, Senior, New Components)
- [x] Required tests/QA in this task file have been executed and are green
- [x] No unchecked items remain in this file (if not applicable, explicitly mark N/A)
- [ ] current_task is only marked complete after verifying every required checkbox

## 🔗 Related Files

Feature P1-High

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
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251219_175416.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- apps/web/src/components/settings/notification-settings.test.tsx ( 460 lines, 14413 bytes)
- packages/database/src/types.ts ( 567 lines, 16664 bytes)

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

- apps/web/src/components/settings/notification-settings.test.tsx ( 460 lines, 14413 bytes)

---

## 📝 PR Template (Copy when done)

```markdown
## What

Implement User-Agent Relationship & Auto-Assignment - Centraized Pool

## Why

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
