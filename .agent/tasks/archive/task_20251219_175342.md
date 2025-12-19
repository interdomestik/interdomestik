---
task_name: 'Admin Panel MVP'
task_type: 'Feature'
priority: 'P0-Critical'
estimate: '1d'
test_level: 'full'
roadmap_ref: 'Phase 1, Week 4'
branch: 'feat/consumer-rights-page'
start_time: 'Fri Dec 19 09:36:17 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'fail (exit 2)'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251219_093606.log'
---

# 🚀 Current Task: Admin Panel MVP

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Admin Panel MVP</objective>
  <type>Feature</type>
  <priority>P0-Critical</priority>
  <estimate>1d</estimate>
  <branch>feat/consumer-rights-page</branch>
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

- [ ] Unit tests added: `src/**/*.test.ts`
- [x] Component tests added: `src/**/*.test.tsx`
- [x] E2E tests added: `e2e/*.spec.ts`
- [ ] Tests use factories from `src/test/factories.ts`
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
- [ ] Migrations include up/down and backfill strategy (if applicable)
- [x] Accessibility checks for UI changes
- [x] Removed debug artifacts (console.log/debugger/TODO left behind)
- [x] New/updated strings added to locales and `pnpm i18n:check` run (if applicable)
- [x] New components kept small; split view vs hooks/logic; co-located tests/stories added
- [ ] Oversized file remediation noted (if any)

## 🧩 New Components & Files Checklist

- [x] File size under limits (soft 250 lines, hard 400); split view vs logic/hooks if larger
- [x] Co-located test (`*.test.tsx`) and story/demo (if using Storybook/MDX)
- [x] i18n keys added for any new UI strings
- [x] Accessibility verified (labels/roles/focus)
- [x] Imported shared styles/components (@interdomestik/ui) where applicable

## 🔗 Related Files

Feature P0-Critical

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | fail (exit 2)                                                                                  |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Coverage   | skipped                                                                                        |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251219_093606.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- apps/web/src/components/settings/notification-settings.test.tsx ( 457 lines, 13949 bytes)
- packages/database/src/types.ts ( 567 lines, 16664 bytes)

## 📏 Changed Files Size Check (>400 lines or >15000 bytes)

Changed files are within limits

---

## 📝 PR Template (Copy when done)

```markdown
## What

Admin Panel MVP

## Why

Phase 1, Week 4

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
