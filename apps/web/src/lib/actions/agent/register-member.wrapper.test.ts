import { db } from '@interdomestik/database/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMemberCore } from './register-member.core';

vi.mock('@interdomestik/database/db', () => ({
  db: {
    transaction: vi.fn(async cb => {
      const tx = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(true),
      };
      return await cb(tx);
    }),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  user: {},
  account: {},
  agentClients: {},
  subscriptions: {},
}));

vi.mock('@/lib/email', () => ({
  sendMemberWelcomeEmail: vi.fn(),
}));

vi.mock('@/server/domains/members/member-number', () => ({
  generateMemberNumber: vi.fn().mockResolvedValue('MEM-2026-000001'),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('new-id'),
}));

describe('registerMemberCore', () => {
  const mockAgent = { id: 'agent1', name: 'Agent Smith' };
  const mockTenantId = 'tenant-1';
  const mockBranchId = 'mk_branch_a';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register member successfully', async () => {
    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData);

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalled();
  });

  it('should fail validation', async () => {
    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'invalid-email'); // Invalid email
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Validation failed');
    }
  });

  it('should handle transaction errors (e.g., email duplicate)', async () => {
    vi.mocked(db.transaction).mockRejectedValue(new Error('Duplicate'));

    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData);

    expect(result).toEqual({
      ok: false,
      error: 'Failed to register member. Email might already exist.',
    });
  });
});
