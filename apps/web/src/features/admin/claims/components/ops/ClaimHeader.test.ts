import { describe, expect, it } from 'vitest';
import { buildAdminUserProfileHref } from './claim-header-links';

describe('buildAdminUserProfileHref', () => {
  it('keeps tenant context when tenantId exists in query params', () => {
    const href = buildAdminUserProfileHref(
      'user-123',
      new URLSearchParams('tenantId=tenant_ks&lifecycle=processing')
    );

    expect(href).toBe('/admin/users/user-123?tenantId=tenant_ks');
  });

  it('returns canonical admin user path when tenantId is missing', () => {
    const href = buildAdminUserProfileHref('user-123', new URLSearchParams('lifecycle=processing'));

    expect(href).toBe('/admin/users/user-123');
  });
});
