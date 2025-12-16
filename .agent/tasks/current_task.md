---
task_name: 'Build Agent Workspace MVP'
task_type: 'Feature'
priority: 'P1-High'
estimate: '3d'
test_level: 'full'
roadmap_ref: 'Phase 2'
branch: 'feat/agent-workspace-mvp'
start_time: 'Tue Dec 16 22:26:54 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: Build Agent Workspace MVP

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Fix Database Schema & Complete Regionalization</objective>
  <status>In Progress</status>
  <type>Chore</type>
  <priority>P1-High</priority>
  <acceptance_criteria>
    - drizzle-kit push runs successfully without errors
    - Schema is fully synced with database
    - Agent workspace is fully translated in Albanian (sq.json)
    - Re-enable document fetching in Agent Detail page
  </acceptance_criteria>
</task_definition>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>3d</estimate>
  <branch>feat/agent-workspace-mvp</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<user_story>
  As an Agent, I want to access a dedicated workspace to view and manage claims,
  so that I can efficiently triage and process customer requests.
</user_story>
<acceptance_criteria>
  - [ ] /agent route is protected (Agents Only)
  - [ ] Agent dashboard lists all active claims
  - [ ] Claims can be filtered by status
  - [ ] Agent can update claim status (Triage)
  - [ ] Agent can see claim details
  - [ ] System prevents unauthorized access
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
- [ ] E2E tests added: `e2e/*.spec.ts`
- [ ] Tests use factories from `src/test/factories.ts`
- [ ] E2E uses fixtures from `e2e/fixtures/`
- [ ] Run: `pnpm qa` (includes all)
- [ ] All tests pass

## ✅ Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests pass at required level (full)
- [ ] `pnpm lint` passes (or no new errors)
- [ ] `pnpm type-check` passes
- [ ] No regressions from baseline
- [ ] (Recommended) `pnpm qa:full` or full checks executed before PR
- [ ] Screenshots added for UI changes (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Code reviewed / self-reviewed

## 🔗 Related Files

<!-- Add discovered file paths here -->

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

Build Agent Workspace MVP

## Why

Phase 2

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
