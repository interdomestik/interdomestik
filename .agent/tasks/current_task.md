---
task_name: 'Paddle E2E Tests'
task_type: 'Feature'
priority: 'P1-High'
estimate: 'TBD'
test_level: 'unit'
roadmap_ref: ''
branch: 'feat/consumer-rights-page'
start_time: 'Thu Dec 18 19:39:42 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_193931.log'
---

# 🚀 Current Task: Paddle E2E Tests

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Paddle E2E Tests</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>TBD</estimate>
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
  As a developer, I want to have automated E2E tests for the Paddle payment flow
  so that I can ensure the pricing page and checkout integration work correctly before every release.
</user_story>
<acceptance_criteria>
  - [ ] Create `apps/web/e2e/pricing.spec.ts`.
  - [ ] Test 1: Visitor can view pricing plans (unauthenticated).
  - [ ] Test 2: Authenticated user sees "Upgrade" button.
  - [ ] Test 3: Clicking "Upgrade" triggers Paddle initialization (mocked).
  - [ ] Ensure `pnpm test:e2e` runs and passes this new spec.
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [x] Unit tests added: `src/**/*.test.ts`
- [ ] Tests use factories from `src/test/factories.ts`
- [x] Run: `pnpm test:unit`
- [x] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (unit)
- [x] `pnpm lint` passes (or no new errors)
- [ ] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [ ] Risks identified (perf, reliability, UX, security, data)
- [ ] Rollback/mitigation plan documented
- [ ] Monitoring/logging impact considered
- [ ] Migrations include up/down and backfill strategy (if applicable)
- [ ] Accessibility checks for UI changes
- [ ] Removed debug artifacts (console.log/debugger/TODO left behind)

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
| Type Check | pass                                                                                           |
| Unit Tests | pass                                                                                           |
| Format     | fail (exit 1)                                                                                  |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251218_193931.log |

## 📏 Oversized Files (>400 lines or >15000 bytes)

- apps/web/coverage/prettify.js ( 2 lines, 17590 bytes)
- apps/web/src/components/settings/notification-settings.test.tsx ( 457 lines, 13949 bytes)
- packages/database/src/types.ts ( 567 lines, 16664 bytes)

---

## 📝 PR Template (Copy when done)

```markdown
## What

Paddle E2E Tests

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
