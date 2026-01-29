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

  // V3 Change: Agents are Members. Do not redirect them to /agent automatically.
  // They can toggle via the sidebar.
  // if (role === 'agent') { return { kind: 'redirect', to: `/${locale}/agent` }; }

  // Redirect staff / operations to their portal
  if (role === 'staff' || role === 'branch_manager') {
    return { kind: 'redirect', to: `/${locale}/staff` };
  }

  // Redirect admin / super-admin to admin portal
  if (role === 'admin' || role === 'super_admin' || role === 'tenant_admin') {
    return { kind: 'redirect', to: `/${locale}/admin` };
  }

  // Members see their personal dashboard
  return { kind: 'ok', userId };
}
