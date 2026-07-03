import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findDocumentsMany: vi.fn(),
  isNull: vi.fn((field: unknown) => ({ op: 'isNull', field })),
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: {
    query: {
      documents: {
        findMany: hoisted.findDocumentsMany,
      },
      subscriptions: {
        findMany: vi.fn(),
      },
    },
  },
  eq: hoisted.eq,
  isNull: hoisted.isNull,
  subscriptions: {
    tenantId: 'subscriptions.tenant_id',
    userId: 'subscriptions.user_id',
  },
}));

vi.mock('@/lib/entity-disclosure.core', () => ({
  getSubscriptionEntityDisclosureCore: vi.fn(),
}));

import { getMemberDocumentsCore } from './_core';

describe('getMemberDocumentsCore document lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findDocumentsMany.mockResolvedValue([]);
  });

  it('filters out soft-deleted member documents', async () => {
    await getMemberDocumentsCore({
      tenantId: 'tenant-ks',
      userId: 'member-1',
    });

    const queryArg = hoisted.findDocumentsMany.mock.calls[0]?.[0] as
      | {
          where?: (
            docs: { deletedAt: string; entityId: string; entityType: string; tenantId: string },
            operators: {
              and: (...args: unknown[]) => unknown;
              eq: (left: unknown, right: unknown) => unknown;
            }
          ) => unknown;
        }
      | undefined;

    const whereAnd = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
    const whereEq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));

    queryArg?.where?.(
      {
        deletedAt: 'documents.deleted_at',
        entityId: 'documents.entity_id',
        entityType: 'documents.entity_type',
        tenantId: 'documents.tenant_id',
      },
      {
        and: whereAnd,
        eq: whereEq,
      }
    );

    expect(hoisted.isNull).toHaveBeenCalledWith('documents.deleted_at');
    expect(whereAnd).toHaveBeenCalledWith(
      expect.objectContaining({ left: 'documents.entity_type', right: 'member' }),
      expect.objectContaining({ left: 'documents.entity_id', right: 'member-1' }),
      expect.objectContaining({ left: 'documents.tenant_id', right: 'tenant-ks' }),
      expect.objectContaining({ field: 'documents.deleted_at', op: 'isNull' })
    );
  });
});
