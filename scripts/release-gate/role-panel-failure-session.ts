const ALLOWED_SESSION_ROLES = new Set([
  'super_admin',
  'admin',
  'tenant_admin',
  'global_support',
  'auditor',
  'branch_manager',
  'staff',
  'agent',
  'member',
]);
const ALLOWED_SESSION_TENANTS = new Set(['tenant_ks', 'tenant_mk']);

function allowlistedSessionField(value, allowedValues) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return allowedValues.has(normalized) ? normalized : 'unexpected';
}

function sanitizeRolePanelFailureSession(session, expectedEmail) {
  const user = session?.payload?.user || session?.payload?.session?.user || {};
  return {
    status: Number.isInteger(session?.status) ? session.status : null,
    identityMatchesExpected:
      typeof user.email === 'string' &&
      user.email.trim().toLowerCase() ===
        String(expectedEmail || '')
          .trim()
          .toLowerCase(),
    role: allowlistedSessionField(user.role, ALLOWED_SESSION_ROLES),
    tenantId: allowlistedSessionField(user.tenantId, ALLOWED_SESSION_TENANTS),
    accessTenantId: allowlistedSessionField(user.accessTenantId, ALLOWED_SESSION_TENANTS),
  };
}

module.exports = { sanitizeRolePanelFailureSession };
