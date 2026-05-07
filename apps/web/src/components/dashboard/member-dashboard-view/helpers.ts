export function getRoleRedirect(role: string | null | undefined): '/admin' | '/staff' | null {
  if (role === 'admin' || role === 'super_admin' || role === 'tenant_admin') {
    return '/admin';
  }

  if (role === 'staff' || role === 'branch_manager') {
    return '/staff';
  }

  return null;
}
