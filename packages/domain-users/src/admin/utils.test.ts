import { describe, expect, it } from 'vitest';

import { resolveTenantId } from './utils';
import type { UserSession } from '../types';

const session = {
  user: {
    id: 'admin-1',
    role: 'admin',
    tenantId: 'tenant_legal_compat',
    accessTenantId: 'tenant_access',
  },
} satisfies UserSession;

describe('resolveTenantId', () => {
  it('uses accessTenantId for non-super-admin access scope', () => {
    expect(resolveTenantId(session, 'tenant_access')).toBe('tenant_access');
    expect(() => resolveTenantId(session, 'tenant_legal_compat')).toThrow('Unauthorized');
    expect(resolveTenantId(session)).toBe('tenant_access');
  });

  it('preserves explicit super-admin tenant selection', () => {
    expect(
      resolveTenantId(
        { user: { id: 'root', role: 'super_admin', tenantId: 'tenant_legal_compat' } },
        'tenant_any'
      )
    ).toBe('tenant_any');
  });
});
