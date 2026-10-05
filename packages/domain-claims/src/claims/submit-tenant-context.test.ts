import './submit-test-mocks';
import { describe, expect, it } from 'vitest';

import {
  buildSubmitArgs,
  generateClaimNumberMock,
  getActiveSubscriptionMock,
  readTenantLocaleMetadataMock,
  submitTx,
  tenantContextOrder,
  tenantContexts,
  txInsert,
} from './submit-test-support';
import { submitClaimCore } from './submit';

describe('submitClaimCore tenant RLS context', () => {
  it('runs assignment reads and claim persistence in separate tenant contexts after membership', async () => {
    getActiveSubscriptionMock.mockImplementation(async () => {
      tenantContextOrder.push('subscription');
      return { branchId: 'branch-1', agentId: 'agent-1' };
    });
    readTenantLocaleMetadataMock.mockImplementation(async () => {
      tenantContextOrder.push('tenant-metadata');
      return { code: 'T1', countryCode: 'XK' };
    });

    await submitClaimCore(buildSubmitArgs({ files: [] }));

    expect(tenantContextOrder).toEqual([
      'subscription',
      'context:open',
      'context:close',
      'tenant-metadata',
      'context:open',
      'context:close',
    ]);
    expect(tenantContexts).toEqual([{ tenantId: 'tenant-1' }, { tenantId: 'tenant-1' }]);
    expect(submitTx.transaction).not.toHaveBeenCalled();
  });

  it('numbers the claim from server-read tenant metadata pinned to the writing tenant', async () => {
    const args = buildSubmitArgs({ files: [] });
    args.trustedClaimId = 'explicit-test-claim';
    await submitClaimCore(args);

    expect(readTenantLocaleMetadataMock).toHaveBeenCalledWith('tenant-1');
    expect(generateClaimNumberMock).toHaveBeenCalledWith(
      submitTx,
      expect.objectContaining({ tenantId: 'tenant-1', claimId: args.trustedClaimId }),
      { tenantId: 'tenant-1', code: 'T1' }
    );
  });

  it('fails closed without persisting when the tenant code is unavailable', async () => {
    readTenantLocaleMetadataMock.mockResolvedValue({ code: '  ', countryCode: 'XK' });

    await expect(submitClaimCore(buildSubmitArgs({ files: [] }))).rejects.toThrow(
      'Failed to create claim. Please try again.'
    );

    expect(txInsert).not.toHaveBeenCalled();
    expect(generateClaimNumberMock).not.toHaveBeenCalled();
    expect(tenantContexts).toEqual([{ tenantId: 'tenant-1' }]);
  });

  it('fails closed when the tenant directory has no row for the writing tenant', async () => {
    readTenantLocaleMetadataMock.mockResolvedValue(null);

    await expect(submitClaimCore(buildSubmitArgs({ files: [] }))).rejects.toThrow(
      'Failed to create claim. Please try again.'
    );

    expect(txInsert).not.toHaveBeenCalled();
  });
});
