import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommissionCore } from './create';

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    id: 'id',
    tenantId: 'tenantId',
    subscriptionId: 'subscriptionId',
    type: 'type',
  },
  user: {
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'new-comm-id'),
}));

describe('createCommissionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validData = {
    agentId: 'agent-1',
    type: 'new_membership' as const,
    amount: 100.5,
    subscriptionId: 'sub-1',
  };

  it('fails if amount is zero or negative', async () => {
    const result = await createCommissionCore({
      ...validData,
      amount: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Amount must be positive');
  });

  it('fails if tenantId cannot be resolved', async () => {
    (db.query.user.findFirst as any).mockResolvedValue(null);

    const result = await createCommissionCore({
      ...validData,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing tenantId for commission');
  });

  it('successfully creates a new commission', async () => {
    (db.query.user.findFirst as any).mockResolvedValue({ tenantId: 'tenant-1' });
    // Mock no existing commission
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });

    const result = await createCommissionCore({
      ...validData,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe('new-comm-id');
    }
    expect(db.insert).toHaveBeenCalled();
  });

  it('returns existing ID if commission is idempotent (duplicate)', async () => {
    (db.query.user.findFirst as any).mockResolvedValue({ tenantId: 'tenant-1' });
    // Mock existing commission
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 'existing-id' }]),
        }),
      }),
    });

    const result = await createCommissionCore({
      ...validData,
    });

    expect(result.success).toBe(true);
    // Should return existing ID, NOT create new one
    if (result.success) {
      expect(result.data?.id).toBe('existing-id');
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});
