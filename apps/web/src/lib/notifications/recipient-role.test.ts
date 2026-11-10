import { beforeEach, describe, expect, it } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  resetMetadataModel,
  state,
} from '@/features/claims/support-handoffs/metadata-query.test-support';
import { getNotificationRecipientRole } from './recipient-role';
const authority = mintTestTenantAuthority('tenant-a');
beforeEach(resetMetadataModel);
describe('notification recipient identity lookup', () => {
  it.each([
    'branch_manager',
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('selects only the same-tenant recipient role %s', async role => {
    state.rows.user = [
      { id: 'recipient', tenant_id: 'tenant-a', role },
      { id: 'recipient', tenant_id: 'tenant-b', role: 'branch_manager' },
    ];
    expect(await getNotificationRecipientRole(authority, 'recipient')).toBe(role);
    expect(state.selections).toEqual([['role']]);
    expect(state.queries[0].params).toEqual(['tenant-a', 'recipient']);
  });
  it('refuses absent and foreign recipients and a mismatched authority access tenant', async () => {
    expect(await getNotificationRecipientRole(authority, 'missing')).toBeNull();
    state.rows.user = [{ id: 'recipient', tenant_id: 'tenant-b', role: 'member' }];
    expect(await getNotificationRecipientRole(authority, 'recipient')).toBeNull();
    state.selections = [];
    expect(
      await getNotificationRecipientRole(
        mintTestTenantAuthority('tenant-a', { accessTenantId: 'tenant-b' }),
        'recipient'
      )
    ).toBeNull();
    expect(state.selections).toEqual([]);
  });
});
