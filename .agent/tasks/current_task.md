---
task_name: 'Member onboarding flow'
task_type: 'Feature'
priority: 'P1-High'
estimate: '2h'
test_level: 'unit'
roadmap_ref: 'Phase 1: Membership'
branch: 'feat/paddle-subscription-integration'
start_time: 'Sun Dec 21 15:15:19 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'fail (exit 1)'
  format: 'fail (exit 1)'
  log: '/Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_151519.log'
---

# 🚀 Current Task: Member onboarding flow

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Enhance member onboarding with PWA install prompt and improved success page</objective>
  <type>Feature</type>
  <priority>P1-High</priority>
  <estimate>2h</estimate>
  <branch>feat/paddle-subscription-integration</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Follow 10x-coding rules
    - Mobile-first PWA flow
    - i18n support
  </constraints>
</task_definition>

<user_story>
  As a new member, I want to be prompted to install the app
  so that I can easily access my benefits later.
</user_story>

<acceptance_criteria>
  - [x] Create PWA Install Button component
  - [x] Detect `beforeinstallprompt` event (Android/Chrome)
  - [x] Show iOS installation instructions if on iPhone
  - [x] Add PWA prompt to Membership Success Page
  - [x] Add translations for install CTA
</acceptance_criteria>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Review Success Page and PWA requirements
- [x] **Planning**: Design `install-button` component
- [x] **Implementation**: Create component, add to page, update locales
- [x] **Verification**: Unit tests for component
- [x] **Documentation**: Self-documenting code

## 🧪 Testing Checklist

- [x] Unit tests added: `src/components/pwa/install-button.test.tsx`
- [x] Run: `pnpm test:unit`
- [x] All tests pass

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level (unit)
- [x] `pnpm lint` passes
- [x] Formatter/Prettier check passes
- [x] `pnpm type-check` passes
- [x] No regressions from baseline
- [x] Screenshots added (N/A)
- [x] Documentation updated (N/A)
- [x] Code reviewed / self-reviewed

## 🧠 Senior Checklist

- [x] Risks identified (Browser support varies)
- [x] Rollback/mitigation plan documented (Component handles graceful degradation)
- [x] Accessibility checks (Button labeling)
- [x] New/updated strings added to locales
- [x] New components kept small

## 🧩 New Components & Files Checklist

- [x] File size under limits
- [x] Co-located test added
- [x] i18n keys added
- [x] Accessibility verified
- [x] Imported shared styles

## 🚦 Completion Gate (must be TRUE before declaring Done)

- [x] All checkboxes above are checked
- [x] Required tests/QA in this task file have been executed and are green
- [x] No unchecked items remain in this file
- [x] current_task is only marked complete after verifying every required checkbox

## 🔗 Related Files

- apps/web/src/components/pwa/install-button.tsx
- apps/web/src/app/[locale]/(app)/dashboard/membership/success/page.tsx

## 📂 Active Context

<!-- Paste file paths or code snippets here as you discover them -->

## 📝 Implementation Notes

- Created `PwaInstallButton` that listens to `beforeinstallprompt`.
- Handles iOS detection via User Agent (fallback instructions).
- Integrated into Membership Success Page.
- Fixed baseline issue in `sq/claims.json`.

## 🔬 QA Baseline (at task start)

| Metric     | Status                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Lint       | pass                                                                                           |
| Type Check | pass                                                                                           |
| Unit Tests | fail (exit 1)                                                                                  |
| Format     | fail (exit 1)                                                                                  |
| Coverage   | skipped                                                                                        |
| Log        | /Users/arbenlila/development/interdomestikv2/.agent/tasks/logs/qa_baseline_20251221_151519.log |

---

## 📝 PR Template (Copy when done)

```markdown
## What

Enhance member onboarding with PWA install flow

## Why

Phase 1: Membership

## How

- Added `PwaInstallButton` component
- Integrated into Success Page
- Added iOS specific instructions

## Testing

- [x] Unit tests pass
- [x] Manual QA (simulated events)
```
