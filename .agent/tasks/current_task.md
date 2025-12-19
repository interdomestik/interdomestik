---
task_name: 'Review and Robustify Agent Dashboard'
task_type: 'Refactor'
priority: 'P1-High'
estimate: '4h'
test_level: 'full'
roadmap_ref: 'Agent Workspace MVP Phase 1'
branch: 'feat/agent-dashboard-robust'
start_time: 'Fri Dec 19 19:17:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
  format: 'pass'
---

# 🚀 Current Task: Review and Robustify Agent Dashboard

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Review and Robustify Agent Dashboard</objective>
  <type>Refactor</type>
  <priority>P1-High</priority>
  <estimate>4h</estimate>
  <branch>feat/agent-dashboard-robust</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules (Explore → Plan → Execute)
    - Mobile-first approach
    - Use next-intl for i18n
    - Write tests as specified in testing checklist
  </constraints>
</task_definition>

<current_limitations>
  - Agent dashboard overview is minimal
  - Claim detail page for agents needs better interactivity similar to admin
  - Need consistent i18n across all agent routes
</current_limitations>
<goals>
  - Enhanced dashboard with summary stats (Active, Pending, New)
  - Interactive "Cockpit" view for agent claim details
  - Full i18n coverage (EN/SQ)
  - E2E verification of agent flows
</goals>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Identify agent-specific files and routes
- [x] **Planning**: Design the "Cockpit" layout and interactive elements
- [x] **Implementation**: Refactor agent pages and add missing functionality
- [x] **Verification**: Run `pnpm qa` and verify E2E flows
- [ ] **Documentation**: Update agent workspace docs if needed

## 🧪 Testing Checklist

- [x] Unit tests for agent actions: `src/actions/agent-claims.test.ts`
- [x] Component tests for agent dashboard elements: `agent-stats-cards.test.tsx`
- [x] E2E tests: `e2e/agent.spec.ts`
- [x] All tests pass

## ✅ Definition of Done

- [x] All agent dashboard pages (Overview, Queue, Details) are robust and functional
- [x] Full i18n support in both EN and SQ
- [x] All tests pass at required level (full)
- [x] `pnpm lint`, `pnpm type-check`, and `pnpm format` pass
- [x] User experience is premium and responsive

## 🔗 Related Files

- apps/web/src/app/[locale]/(agent)/agent/
- apps/web/src/actions/agent-claims.ts
- apps/web/src/messages/en/agent.json
- apps/web/src/messages/sq/agent.json
