---
task_name: "Fix i18n missing keys"
task_type: "Bug Fix"
priority: "P0-Critical"
estimate: "2h"
test_level: "unit"
roadmap_ref: ""
branch: "fix/i18n-config"
start_time: "Wed Dec 17 14:07:51 CET 2025"
baseline:
  lint: "pass"
  typecheck: "fail (exit 254)"
  tests: "pass"
  format: "fail (exit 1)"
  log: "/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251217_140744.log"
---

# 🚀 Current Task: Fix i18n missing keys

## 📋 10x Context Prompt
Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Fix i18n missing keys</objective>
  <type>Bug Fix</type>
  <priority>P0-Critical</priority>
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
- [ ] **Exploration**: Identify files using `project_map` and `read_files`
- [ ] **Planning**: Create a step-by-step implementation plan
- [ ] **Implementation**: Execute code changes
- [ ] **Verification**: Run `pnpm qa` or relevant tests
- [ ] **Documentation**: Update relevant docs if needed

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
| Type Check | fail (exit 254) |
| Unit Tests | pass |
| Format | fail (exit 1) |
| Log | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251217_140744.log |

---

## 📝 PR Template (Copy when done)
```markdown
## What
Fix i18n missing keys

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
