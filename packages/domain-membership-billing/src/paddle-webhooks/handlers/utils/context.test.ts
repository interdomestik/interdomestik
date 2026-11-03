import { mockDbResponse, resolution } from './context.test-support';
import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeTestPaddleOwner } from '../../paddle-authority.test-support';
import { resolveBranchId } from './context';

describe('context utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolution.authorizePaddleTenant.mockReset().mockImplementation(authorizeTestPaddleOwner);
    resolution.resolvePaddleSubscriptionOwner.mockReset().mockResolvedValue(null);
    resolution.resolvePaddleUserOwner.mockReset().mockResolvedValue(null);
  });

  describe('resolveBranchId', () => {
    it('should return agent branchId if agentId is provided and agent exists', async () => {
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ branchId: 'br_agent' }));

      const result = await resolveBranchId({
        customData: { agentId: 'ag_1' },
        tenantId: 'tn_1',
        db: db as any,
      });

      expect(result).toBe('br_agent');
    });

    it('should fallback to default branch when agentId is provided but agent has no branchId', async () => {
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ branchId: null }));
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_default' } })
      );

      const result = await resolveBranchId({
        customData: { agentId: 'ag_1' },
        tenantId: 'tn_1',
        db: db as any,
      });

      expect(result).toBe('br_default');
    });

    it('should fallback to default branch setting if no agentId', async () => {
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_default' } })
      );

      const result = await resolveBranchId({
        customData: {},
        tenantId: 'tn_1',
        db: db as any,
      });

      expect(result).toBe('br_default');
    });

    it('should handle various JSON object structures for default branch', async () => {
      (db.query.tenantSettings.findFirst as any)
        .mockImplementationOnce(mockDbResponse({ value: { defaultBranchId: 'br_1' } }))
        .mockImplementationOnce(mockDbResponse({ value: { id: 'br_2' } }))
        .mockImplementationOnce(mockDbResponse({ value: { value: 'br_3' } }));

      expect(await resolveBranchId({ customData: {}, tenantId: 't', db: db as any })).toBe('br_1');
      expect(await resolveBranchId({ customData: {}, tenantId: 't', db: db as any })).toBe('br_2');
      expect(await resolveBranchId({ customData: {}, tenantId: 't', db: db as any })).toBe('br_3');
    });

    it('should return undefined if default branch setting is missing or invalid', async () => {
      (db.query.tenantSettings.findFirst as any).mockImplementation(mockDbResponse(undefined));
      const result = await resolveBranchId({ customData: {}, tenantId: 't', db: db as any });
      expect(result).toBeUndefined();
    });
  });
});
