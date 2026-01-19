export type MemberDashboardResult =
  | { kind: 'ok'; userId: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'forbidden' };

/**
 * Pure core logic for the Member Dashboard.
 * Decides if the user should see the dashboard or be redirected based on their role.
 */
export function getMemberDashboardCore(params: {
  role: string;
  userId: string;
  locale: string;
}): MemberDashboardResult {
  const { role, userId, locale } = params;

  // Redirect agents to their sales portal
  if (role === 'agent') {
    return { kind: 'redirect', to: `/${locale}/agent` };
  }

  // Redirect staff to their operations portal
  if (role === 'staff') {
    return { kind: 'redirect', to: `/${locale}/staff` };
  }

  // Redirect admin to admin portal
  if (role === 'admin') {
    return { kind: 'redirect', to: `/${locale}/admin` };
  }

  // Members see their personal dashboard
  return { kind: 'ok', userId };
}
