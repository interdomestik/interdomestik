import { describe, expect, it, vi } from 'vitest';
import { getClaimNumberResolverCore } from './_core';

describe('getClaimNumberResolverCore', () => {
  const mockDb = {
    query: {
      claims: {
        findFirst: vi.fn(),
      },
    },
  };

  it('resolves valid claim number', async () => {
    mockDb.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    const result = await getClaimNumberResolverCore({
      claimNumber: 'CLM-KS-2024-000001',
      tenantId: 't1',
      db: mockDb,
    });
    expect(result.claimId).toBe('c123');
  });

  it('returns null for invalid format', async () => {
    const result = await getClaimNumberResolverCore({
      claimNumber: 'INVALID',
      tenantId: 't1',
      db: mockDb,
    });
    expect(result.claimId).toBeNull();
  });

  it('returns null for non-existent claim', async () => {
    mockDb.query.claims.findFirst.mockResolvedValue(null);
    const result = await getClaimNumberResolverCore({
      claimNumber: 'CLM-2024-999',
      tenantId: 't1',
      db: mockDb,
    });
    expect(result.claimId).toBeNull();
  });
});
