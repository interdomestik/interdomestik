---
task_name: 'finish the stabilization of the Settings Page E2E tests to ensure the Core MVP is 100% verified.'
task_type: 'Bug Fix'
priority: 'P1-High'
estimate: '1h'
test_level: 'full'
roadmap_ref: 'Phase 1'
branch: 'feat/fix-tests-proxy-arch'
start_time: 'Thu Dec 18 13:12:32 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'fail (exit 2)'
  tests: 'fail (exit 1)'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_131225.log'
---

# 🚀 Current Task: finish the stabilization of the Settings Page E2E tests to ensure the Core MVP is 100% verified.

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>finish the stabilization of the Settings Page E2E tests to ensure the Core MVP is 100% verified.</objective>
  <type>Bug Fix</type>
  <priority>P1-High</priority>
  <estimate>1h</estimate>
  <branch>feat/fix-tests-proxy-arch</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<reproduction_steps>
  1. Navigate to...
  2. Click on...
  3. Observe...
</reproduction_steps>
<expected_behavior>
  The expected result is...
</expected_behavior>
<actual_behavior>
  Instead, what happens is...
</actual_behavior>
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
- [x] Migrations include up/down and backfill strategy (if applicable)
- [x] Accessibility checks for UI changes
- [x] Removed debug artifacts (console.log/debugger/TODO left behind)

## 🔗 Related Files

- apps/web/src/test/
- apps/web/e2e/
- apps/web/vitest.config.ts
- apps/web/playwright.config.ts

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | fail (exit 2)                                                                                  |
| Unit Tests | fail (exit 1)                                                                                  |
| Format     | fail (exit 1)                                                                                  |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_131225.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- apps/web/src/components/settings/notification-settings.test.tsx ( 450 lines, 13857 bytes)
- packages/database/src/types.ts ( 587 lines, 16408 bytes)

---

## 📝 PR Template (Copy when done)

```markdown
## What

finish the stabilization of the Settings Page E2E tests to ensure the Core MVP is 100% verified.

## Why

Phase 1

## How

Implemented robust locators for Radix UI-based Settings components (Language & Notifications). Standardized auth redirection logic to use `/login` and aligned E2E test data with the local database seeding script. Stabilized unit tests by fixing mock hoisting issues and stabilizing `next-intl` mock references.

## Testing

- [x] Unit tests pass (`pnpm test:unit`)
- [x] E2E tests pass (`pnpm test:e2e`)
- [x] Manual QA completed
- [x] No regressions in existing functionality

## Screenshots (if UI changes)

<!-- Add screenshots here -->

## Notes to Reviewer

<!-- Highlight areas needing careful review, known limitations, or follow-up tasks -->
```
