/**
 * Feature Flags
 *
 * Simple environment-based feature flag utility.
 * For production, consider using a proper feature flag service.
 */

/**
 * Branch Dashboard Page feature flag
 * Enable via FEATURE_BRANCH_DASHBOARD=true in environment
 */
export function isBranchDashboardEnabled(): boolean {
  return process.env.FEATURE_BRANCH_DASHBOARD === 'true';
}
