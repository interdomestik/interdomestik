---
task_name: 'Enhance Admin Dashboard'
task_type: 'feature'
priority: 'P2'
estimate: '2h'
test_level: 'full'
branch: 'feat/enhance-admin-dashboard'
start_time: 'Fri Dec 19 18:40:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 🚀 Current Task: Enhance Admin Dashboard

## 📋 Context

The goal is to make the Admin Dashboard (`/admin`) more actionable by adding a recent activity feed, a widget for unassigned claims, and quick actions for common administrative tasks.

## 🎯 Objectives

- [x] **Recent Activity Feed**: Implement a section showing the last 5 claims submitted or updated.
- [x] **Unassigned Claims Widget**: Create a prominent list of claims that lack an assigned agent.
- [x] **Quick Actions**: Add easy-access buttons for "Create User" and "Invite Agent".
- [x] **i18n Support**: Ensure all new UI elements are internationalized in English and Albanian.

## 🏗️ Implementation Plan

1. [x] **Data Fetching**:
   - Update the `getStats` or add new functions in `apps/web/src/app/[locale]/admin/page.tsx` to fetch:
     - Last 5 updated/submitted claims.
     - List of claims where `agentId` is null.
2. [x] **UI Components**:
   - Create a `RecentActivity` component (or inline).
   - Create an `UnassignedClaims` widget.
   - Create a `QuickActions` component/section.
3. [x] **Internationalization**:
   - Add translation keys to `apps/web/src/messages/en/admin.json` and `apps/web/src/messages/sq/admin.json`.
4. [x] **Verification**:
   - Build health check.
   - Lint and Typecheck.
   - Manual UI verification.

## ✅ Definition of Done

- [x] Admin dashboard displays recent activity.
- [x] Unassigned claims are clearly visible to admins.
- [x] Quick action buttons are functional (or linked to their respective paths).
- [x] All new text is translated.
- [x] No regressions in build or tests.
