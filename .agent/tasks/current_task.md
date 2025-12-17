---
task_name: 'Polish and E2E Test Claim Wizard'
task_type: 'Feature'
priority: 'P1-High'
estimate: '2h'
test_level: 'full'
roadmap_ref: ''
branch: 'fix/i18n-config'
start_time: 'Wed Dec 17 12:28:23 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: Polish and E2E Test Claim Wizard

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Polish and E2E Test Claim Wizard</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
  <branch>fix/i18n-config</branch>
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

- [ ] **Exploration**: Identify existing E2E tests (`e2e/claims.spec.ts`, `e2e/claim-submission.spec.ts`) and wizard components.
- [ ] **Fix**: Ensure E2E tests use `data-testid` and resilient selectors.
- [ ] **Fix**: Verify "Create Claim" flow manually and via test (Uploads, Steps).
- [ ] **Polish**: Ensure translations are correct in the wizard.
- [ ] **Verification**: Run `pnpm test:e2e` and confirm pass.

## 🧪 Testing Checklist

- [ ] `apps/web/e2e/claim-submission.spec.ts` passes
- [ ] Upload functionality works in test environment

## ✅ Definition of Done

- [ ] E2E tests pass (`pnpm test:e2e`)
- [ ] Wizard UI is polished (no missing translations)
- [ ] `pnpm lint` passes
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline

## 🔗 Related Files

- apps/web/src/components/claims/
- apps/web/src/actions/claims.ts
- apps/web/src/lib/validators/claims.ts
- packages/database/src/schema.ts (claims table)
- e2e/claims.spec.ts
- apps/web/src/components/claims/claim-wizard.tsx
- apps/web/src/components/claims/wizard-\*.tsx
- apps/web/src/lib/validators/claims.ts
- apps/web/src/test/
- apps/web/e2e/
- apps/web/vitest.config.ts
- apps/web/playwright.config.ts

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)

| Metric     | Status |
| ---------- | ------ |
| Lint       | pass   |
| Type Check | pass   |
| Unit Tests | pass   |

---

## 📝 PR Template (Copy when done)

```markdown
## What

Polish and E2E Test Claim Wizard

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
