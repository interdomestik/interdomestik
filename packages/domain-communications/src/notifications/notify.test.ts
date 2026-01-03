import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

mocks.insert.mockReturnValue({ values: mocks.insertValues });

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: { findFirst: mocks.findFirst },
    },
    insert: mocks.insert,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  notifications: 'notifications',
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

import { sendNotification } from './notify';

describe('sendNotification', () => {
  it('rejects when tenant does not match user tenant', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return Promise.resolve({ tenantId: 'tenant-2' });
    });

    const result = await sendNotification(
      'user-1',
      'new_message',
      { claimId: 'claim-1' },
      { tenantId: 'tenant-1' }
    );

    expect(result).toEqual({ success: false, error: 'Tenant mismatch for notification' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.anything(),
      expect.any(Object)
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
