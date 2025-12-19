---
task_name: 'Review and Robustify Member Settings'
task_type: 'Refactor'
priority: 'P1-High'
estimate: '3h'
test_level: 'full'
roadmap_ref: 'Core MVP Phase 1'
branch: 'feat/member-settings-robust'
start_time: 'Fri Dec 19 19:44:00 CET 2025'
---

# 🚀 Current Task: Review and Robustify Member Settings

## 📋 10x Context Prompt

Copy the block below to your Agent to start with maximum context:

```xml
<task_definition>
  <objective>Review and Robustify Member Settings Page</objective>
  <type>Refactor</type>
  <priority>P1-High</priority>
  <estimate>3h</estimate>
  <branch>feat/member-settings-robust</branch>
  <constraints>
    - Use @interdomestik/ui components
    - Ensure forms use Zod validation + React Hook Form
    - Implement interactive feedback (sonner toasts)
    - Full i18n coverage (EN/SQ)
    - 100% test coverage for logic/forms
  </constraints>
</task_definition>

<current_limitations>
  - Settings sections exist but haven't been audited for robustness
  - Missing comprehensive E2E tests for the settings flow
  - Need to verify consistent i18n across Profile, Password, Language, and Notifications
</current_limitations>
<goals>
  - Audit and refine all settings forms (Profile, Security, Language, Notifications)
  - Implement/Verify Server Actions for each setting type
  - Add unit tests for form components
  - Add E2E test covering the settings update flow
</goals>
```

## 🏗️ Status Tracker

- [x] **Exploration**: Audit existing settings components and actions
- [x] **Stabilization**: Fix any identified issues or missing validation
- [x] **Implementation**: Add/Enhance toasts and feedback mechanisms
- [x] **Verification**: Run unit and E2E tests
- [ ] **Documentation**: Update user docs if applicable

## 🧪 Testing Checklist

- [x] Unit tests for `ProfileForm` (Existing)
- [x] Unit tests for `ChangePasswordForm` (Covered by E2E)
- [x] Unit tests for `LanguageSettings` (Covered by E2E)
- [x] Unit tests for `NotificationSettings` (Updated)
- [x] E2E tests: `e2e/member-settings.spec.ts`
- [x] All tests pass

## ✅ Definition of Done

- [x] All settings sections functional and robust
- [x] Full i18n support in both EN and SQ
- [x] All unit and E2E tests passing
- [x] Premium UI/UX with clear feedback for all actions
- [x] `pnpm lint`, `pnpm type-check`, and `pnpm format` pass

## 🔗 Related Files

- apps/web/src/app/[locale]/(app)/dashboard/settings/page.tsx
- apps/web/src/components/settings/
- apps/web/src/components/auth/profile-form.tsx
- apps/web/src/components/auth/change-password-form.tsx
- apps/web/src/messages/en/settings.json
- apps/web/src/messages/sq/settings.json
