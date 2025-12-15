---
task_name: "Complete Settings Page with Profile, Notifications, and Language Selection"
task_type: "Feature"
priority: "P1-High"
estimate: "2h"
test_level: "component"
roadmap_ref: "Phase 1, Week 6"
branch: "main"
start_time: "Mon Dec 15 22:15:19 CET 2025"
baseline:
  lint: "pass"
  typecheck: "fail (exit 2)"
  tests: "pass"
---

# 🚀 Current Task: Complete Settings Page with Profile, Notifications, and Language Selection

## 📋 10x Context Prompt
Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Complete Settings Page with Profile, Notifications, and Language Selection</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
  <branch>main</branch>
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
- [ ] **Exploration**: Identify files using `project_map` and `read_files`
- [ ] **Planning**: Create a step-by-step implementation plan
- [ ] **Implementation**: Execute code changes
- [ ] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist
- [ ] Unit tests added: `src/**/*.test.ts`
- [ ] Component tests added: `src/**/*.test.tsx`
- [ ] Tests use factories from `src/test/factories.ts`
- [ ] Run: `pnpm test:unit`
- [ ] All tests pass

## ✅ Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests pass at required level (component)
- [ ] `pnpm lint` passes (or no new errors)
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🔗 Related Files
- apps/web/src/messages/*.json
- apps/web/src/i18n/routing.ts
- apps/web/src/middleware.ts

## 📂 Active Context
<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes
<!-- Add decisions, trade-offs, blockers here -->

## 🔬 QA Baseline (at task start)
| Metric | Status |
|--------|--------|
| Lint | pass |
| Type Check | fail (exit 2) |
| Unit Tests | pass |

---

## 📝 PR Template (Copy when done)
```markdown
## What
Complete Settings Page with Profile, Notifications, and Language Selection

## Why
Phase 1, Week 6

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
