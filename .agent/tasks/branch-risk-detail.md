# Implementation Plan - Branch Risk Signaling (Detail Page)

This plan covers the integration of risk levels, health scores, and severity indicators into the Branch Detail page dashboard.

## Phase 1: Data & Integration (Completed)

- [x] Update `BranchStats` type to include `healthScore` and `severity`.
- [x] Update `getBranchStats` core query to calculate these values using `branch-risk` utilities.
- [x] Update `getBranchDashboard` action to pass `isActive` flag for risk calculation.

## Phase 2: UI Implementation (Completed)

- [x] Enhance `BranchHeader` component to display:
  - Dynamic risk badge (Healthy, Watch, Urgent, Inactive).
  - Health score with a visual progress bar.
  - Status-dependent styling (border colors).
- [x] Update `BranchDashboardPage` (`page.tsx`) to pass `stats` to `BranchHeader`.
- [x] Update `BranchStats` component to highlight critical stats (e.g., SLA breaches in red if > 0).

## Phase 3: Localization & Review

- [x] Verify i18n keys match `admin-branches.json`.
- [x] Run `pnpm check` to ensure no regressions.
- [ ] Manual verification of the UI layout.

## Next Steps

1. Verify build health.
