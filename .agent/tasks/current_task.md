---
task_name: 'Phase 2 Leads Integration'
task_type: 'Feature'
priority: 'P1-High'
estimate: 'TBD'
test_level: 'unit'
roadmap_ref: ''
branch: 'phase-2-leads-activity-logging'
start_time: 'Wed Dec 24 12:20:55 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251224_122034.log'
---

# 🚀 Current Task: Phase 2 Leads Integration

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Phase 2 Leads Integration</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>TBD</estimate>
  <branch>phase-2-leads-activity-logging</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As a [user type], I want to [action]
  so that I can [benefit].
</user_story>
<acceptance_criteria>
  - [ ] Criterion 1
  - [ ] Criterion 2
  - [ ] Criterion 3
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [/] Unit tests added: `src/**/*.test.ts` (Manual verification relied upon per plan)
- [ ] Tests use factories from `src/test/factories.ts`
- [ ] Run: `pnpm test:unit`
- [ ] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (unit)
- [x] `pnpm lint` passes (or no new errors)
- [/] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] (Recommended) `pnpm qa:full` or full checks executed before PR
- [x] Screenshots added for UI changes (if applicable)
- [x] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

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

- [x] File size under limits (soft 250 lines, hard 400); split view vs logic/hooks if larger
- [-] Co-located test (`*.test.tsx`) and story/demo (if using Storybook/MDX) (Skipped per plan)
- [x] i18n keys added for any new UI strings
- [x] Accessibility verified (labels/roles/focus)
- [x] Imported shared styles/components (@interdomestik/ui) where applicable

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [x] All checkboxes above are checked (DoD, Senior, New Components)
- [x] Required tests/QA in this task file have been executed and are green
- [x] No unchecked items remain in this file (if not applicable, explicitly mark N/A)
- [x] current_task is only marked complete after verifying every required checkbox

## 🔗 Related Files

packages/database/src/schema/crm.ts apps/web/src/actions/activities.ts apps/web/src/components/crm/log-activity-dialog.tsx apps/web/src/app/[locale]/(agent)/agent/leads/[id]/page.tsx

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
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251224_122034.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 937 lines, 26696 bytes)
- apps/web/src/app/[locale]/(agent)/agent/clients/[id]/page.tsx ( 377 lines, 15432 bytes)
- apps/web/src/actions/claims.test.ts ( 418 lines, 12877 bytes)
- apps/web/src/actions/claims.ts ( 429 lines, 11758 bytes)

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

Changed files are within limits

---

## 📝 PR Template (Copy when done)

```markdown
## What

Phase 2 Leads Integration

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
