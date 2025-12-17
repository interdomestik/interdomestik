---
task_name: 'Complete Settings page'
task_type: 'Feature'
priority: 'P0-Critical'
estimate: '4h'
test_level: 'unit'
roadmap_ref: 'Phase 1'
branch: 'fix/i18n-config'
start_time: 'Wed Dec 17 14:14:00 CET 2025'
end_time: 'Wed Dec 17 14:25:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass (134 unit)'
  build: 'pass'
---

# 🚀 Task: Complete Settings Page

## 📋 Problem Statement

The Settings page components (ProfileForm, ChangePasswordForm) were using hardcoded English strings instead of translations.

## ✅ Solution

1. Added missing translation keys for `settings.profile` and `settings.security` sections
2. Updated `ProfileForm` to use `useTranslations('settings.profile')`
3. Updated `ChangePasswordForm` to use `useTranslations('settings.security')`
4. Added Albanian translations for all new keys

## 🏗️ Status Tracker

- [x] **Exploration**: Reviewed existing settings page and components
- [x] **Analysis**: Identified hardcoded strings in ProfileForm and ChangePasswordForm
- [x] **Implementation**:
  - Added i18n keys to en.json and sq.json
  - Updated ProfileForm with translations
  - Updated ChangePasswordForm with translations
- [x] **Verification**: Type check, lint, unit tests, and build all pass
- [x] **Documentation**: Task file complete

## 🧪 Testing Checklist

- [x] Type check passes
- [x] Lint passes (13 warnings, 0 errors)
- [x] Unit tests pass (134/134)
- [x] Build passes

## ✅ Definition of Done

- [x] All acceptance criteria met
- [x] Tests pass at required level: ✅
- [x] `pnpm lint` passes: ✅
- [x] `pnpm type-check` passes: ✅
- [x] `pnpm build` passes: ✅
- [x] No regressions from baseline: ✅

## 🔗 Files Modified

- `apps/web/src/messages/en.json` - Added profile/security form labels
- `apps/web/src/messages/sq.json` - Added Albanian translations
- `apps/web/src/components/auth/profile-form.tsx` - Added i18n support
- `apps/web/src/components/auth/change-password-form.tsx` - Added i18n support

## 📝 Translation Keys Added

### settings.profile

| Key                 | EN                                         | SQ                                    |
| ------------------- | ------------------------------------------ | ------------------------------------- |
| fullName            | Full Name                                  | Emri i Plotë                          |
| fullNamePlaceholder | John Doe                                   | Filan Fisteku                         |
| saveChanges         | Save Changes                               | Ruaj Ndryshimet                       |
| saving              | Saving...                                  | Duke ruajtur...                       |
| success             | Profile updated                            | Profili u përditësua                  |
| successDescription  | Your changes have been saved successfully. | Ndryshimet tuaja u ruajtën me sukses. |
| error               | Failed to update profile                   | Dështoi përditësimi i profilit        |

### settings.security

| Key                | EN                                           | SQ                                     |
| ------------------ | -------------------------------------------- | -------------------------------------- |
| currentPassword    | Current Password                             | Fjalëkalimi Aktual                     |
| newPassword        | New Password                                 | Fjalëkalimi i Ri                       |
| confirmPassword    | Confirm Password                             | Konfirmo Fjalëkalimin                  |
| updatePassword     | Update Password                              | Përditëso Fjalëkalimin                 |
| updating           | Updating...                                  | Duke përditësuar...                    |
| success            | Password updated                             | Fjalëkalimi u përditësua               |
| successDescription | Your password has been changed successfully. | Fjalëkalimi juaj u ndryshua me sukses. |
| error              | Failed to change password                    | Dështoi ndryshimi i fjalëkalimit       |

## Commits

- `e4e0c87` - feat(settings): add i18n support to Profile and Password forms
