---
task_name: 'Implement Admin Analytics'
task_type: 'feature'
priority: 'P2'
estimate: '3h'
test_level: 'full'
branch: 'feat/admin-analytics'
start_time: 'Fri Dec 19 18:43:00 CET 2025'
baseline:
  lint: 'pass'
  typecheck: 'pass'
  tests: 'pass'
---

# 📊 Current Task: Implement Admin Analytics

## 📋 Context

Replace the placeholder at `/admin/analytics` with a functional dashboard that provides insight into platform performance, claim distributions, and user trends.

## 🎯 Objectives

- [x] **Core Metrics**: Display total claim value, average claim amount, and success rate.
- [x] **Distribution Views**:
  - Claims by Status (New, Verification, Evaluation, Negotiation, Court, Resolved, Rejected).
  - Claims by Category (e.g., Retail, Services).
- [x] **Trend Insight**: Display user distribution using Progress bars.
- [x] **i18n Support**: Full localization in English and Albanian.

## 🏗️ Implementation Plan

1. [x] **Data Fetching**:
   - Implement `getAnalyticsData` in `apps/web/src/app/[locale]/admin/analytics/page.tsx`.
   - Use Drizzle to aggregate data (sums, counts by group).
2. [x] **UI Design**:
   - Use the existing `Card` and `Progress` components from `@interdomestik/ui`.
   - Create visual "mini-charts" using CSS/Progress bars for status distribution.
3. [x] **Internationalization**:
   - Add `analytics` and `settings_page` sections to `admin.json` translations.
4. [x] **Verification**:
   - Ensure type safety and build health.

## ✅ Definition of Done

- [x] Admin analytics page shows real-time aggregated data from the DB.
- [x] Claim status distribution is visually represented.
- [x] Financial metrics (Total Value, Average) are displayed correctly.
- [x] Admin Settings UI is implemented and functional.
- [x] UI is fully responsive and localized.
