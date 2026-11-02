import { tableRefs, mocks } from './convert.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it } from 'vitest';

import { hasTenantLeadForConversion } from './convert';

describe('hasTenantLeadForConversion', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    mocks.db.query.memberLeads.findFirst.mockReset();
    mocks.withTenantContext.mockReset();
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback(mocks.db));
    mocks.eq.mockClear();
    mocks.and.mockClear();
  });

  it('returns true when the lead belongs to the tenant', async () => {
    mocks.db.query.memberLeads.findFirst.mockResolvedValue({ id: 'lead-1' });

    const result = await hasTenantLeadForConversion(authority, { leadId: 'lead-1' });

    expect(result).toBe(true);
    expect(mocks.db.query.memberLeads.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { id: true },
      })
    );
    const query = mocks.db.query.memberLeads.findFirst.mock.calls[0]?.[0] as {
      where: (
        lead: typeof tableRefs.memberLeads,
        ops: { eq: typeof mocks.eq; and: typeof mocks.and }
      ) => unknown;
    };
    query.where(tableRefs.memberLeads, { eq: mocks.eq, and: mocks.and });
    expect(mocks.eq).toHaveBeenCalledWith(tableRefs.memberLeads.id, 'lead-1');
    expect(mocks.eq).toHaveBeenCalledWith(tableRefs.memberLeads.tenantId, 'tenant-1');
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
  });

  it('returns false without writes when the lead is missing or belongs to another tenant', async () => {
    mocks.db.query.memberLeads.findFirst.mockResolvedValue(null);

    const result = await hasTenantLeadForConversion(authority, { leadId: 'lead-other' });

    expect(result).toBe(false);
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });
});
