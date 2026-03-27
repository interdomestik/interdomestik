import { describe, expect, it } from 'vitest';
import { formatClaimCreatedDate } from './claim-header-date';
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

describe('formatClaimCreatedDate', () => {
  it('formats MK claim dates with the active locale instead of English fallback', () => {
    expect(formatClaimCreatedDate(new Date('2025-12-30T00:00:00.000Z'), 'mk')).toContain(
      'декември'
    );
  });
});
