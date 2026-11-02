import { db, withTenantContext } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommissionCore, createCommissionWithDispositionCore } from './create';

// Mock dependencies
vi.mock('@interdomestik/database', () => {
  const db = {
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
  };
  return {
    db,
    withTenantContext: vi.fn(
      async (_context: unknown, action: (tx: typeof db) => Promise<unknown>) => action(db)
    ),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    id: 'id',
    tenantId: 'tenantId',
    subscriptionId: 'subscriptionId',
    type: 'type',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  and: vi.fn((...clauses: unknown[]) => ({ clauses })),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'new-comm-id'),
}));

describe('createCommissionCore', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validData = {
    agentId: 'agent-1',
    type: 'new_membership' as const,
    amount: 100.5,
    subscriptionId: 'sub-1',
    authority,
  };

  it('fails if amount is zero or negative', async () => {
    const result = await createCommissionCore({
      ...validData,
      amount: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Amount must be positive');
  });

  it('fails closed before DB reads or writes when the tenant authority is not recognized', async () => {
    const result = await createCommissionCore({
      ...validData,
      authority: { tenantId: 'tenant-1' } as unknown as TenantAuthority,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to create commission');
    expect(withTenantContext).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('successfully creates a tenant-scoped new commission', async () => {
    // Mock no existing commission
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
        }),
      }),
    });

    const result = await createCommissionWithDispositionCore({
      ...validData,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe('new-comm-id');
      expect(result.data?.created).toBe(true);
    }
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(db.insert).toHaveBeenCalled();
  });

  it('returns existing ID if commission is idempotent and keeps duplicate lookup tenant-scoped', async () => {
    // Mock existing commission
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 'existing-id' }]),
        }),
      }),
    });

    const result = await createCommissionWithDispositionCore({
      ...validData,
    });

    expect(result.success).toBe(true);
    // Should return existing ID, NOT create new one
    if (result.success) {
      expect(result.data?.id).toBe('existing-id');
      expect(result.data?.created).toBe(false);
    }
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(eq).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(and).toHaveBeenCalledWith(
      { field: 'tenantId', value: 'tenant-1' },
      { field: 'subscriptionId', value: 'sub-1' },
      { field: 'type', value: 'new_membership' }
    );
    expect(db.insert).not.toHaveBeenCalled();
  });
});
