---
task_name: 'check the project architecture and fix the drizzle seed schema ensuring the seed users are properly seeded'
task_type: 'Bug Fix'
priority: 'P0-Critical'
estimate: '1h'
test_level: 'none'
roadmap_ref: ''
branch: 'fix/i18n-config'
start_time: 'Wed Dec 17 12:07:26 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: check the project architecture and fix the drizzle seed schema ensuring the seed users are properly seeded

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>check the project architecture and fix the drizzle seed schema ensuring the seed users are properly seeded</objective>
  <type>Bug Fix</type>
  <priority>P0-Critical</priority>
  <estimate>1h</estimate>
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

## 🏗️ Status Tracker

- [x] **Exploration**: Identify files using `project_map` and `read_files`
- [x] **Planning**: Create a step-by-step implementation plan
- [x] **Implementation**: Execute code changes
- [x] **Verification**: Run `pnpm qa` or relevant tests
- [x] **Documentation**: Update relevant docs if needed

## 🧪 Testing Checklist

- [/] No tests required for this task (Seed script verified functionality)

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (seed ran)
- [x] `pnpm lint` passes (or no new errors)
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] (Recommended) `pnpm qa:full` or full checks executed before PR
- [x] Screenshots added for UI changes (if applicable)
- [x] Documentation updated (if applicable)
- [x] Code reviewed / self-reviewed

## 🔗 Related Files

- packages/database/src/schema.ts
- packages/database/src/index.ts
- supabase/migrations/

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

check the project architecture and fix the drizzle seed schema ensuring the seed users are properly seeded

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
