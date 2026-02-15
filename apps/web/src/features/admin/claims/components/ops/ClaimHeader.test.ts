import { describe, expect, it } from 'vitest';
import { buildAdminUserProfileHref } from './claim-header-links';

describe('buildAdminUserProfileHref', () => {
  it('always returns canonical admin user path without tenant query context', () => {
    const href = buildAdminUserProfileHref(
      'user-123',
      new URLSearchParams('tenantId=tenant_ks&lifecycle=processing')
    );

    expect(href).toBe('/admin/users/user-123');
  });
});
