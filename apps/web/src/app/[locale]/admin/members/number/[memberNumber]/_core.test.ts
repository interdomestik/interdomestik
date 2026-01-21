import { describe, expect, it, vi } from 'vitest';
import { getMemberNumberResolverCore } from './_core';

describe('getMemberNumberResolverCore', () => {
  const mockDb = {
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
  };

  const mockParse = vi.fn().mockReturnValue(true);

  it('resolves valid member number for allowed role', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({ id: 'u123' });
    const result = await getMemberNumberResolverCore({
      memberNumber: 'MEM-2024-001',
      tenantId: 't1',
      role: 'tenant_admin',
      allowedRoles: ['tenant_admin'],
      db: mockDb,
      parseMemberNumber: mockParse,
    });
    expect(result.ok).toBe(true);
    expect(result.userId).toBe('u123');
  });

  it('returns FORBIDDEN for unauthorized role', async () => {
    const result = await getMemberNumberResolverCore({
      memberNumber: 'MEM-2024-001',
      tenantId: 't1',
      role: 'agent',
      allowedRoles: ['tenant_admin'],
      db: mockDb,
      parseMemberNumber: mockParse,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND for invalid format', async () => {
    mockParse.mockReturnValueOnce(null);
    const result = await getMemberNumberResolverCore({
      memberNumber: 'INVALID',
      tenantId: 't1',
      role: 'tenant_admin',
      allowedRoles: ['tenant_admin'],
      db: mockDb,
      parseMemberNumber: mockParse,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('NOT_FOUND');
  });
});
