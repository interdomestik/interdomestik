import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const store = {
    claims: [] as Array<{
      id: string;
      tenantId: string;
      status: string;
      updatedAt: Date;
    }>,
    tokens: [] as Array<{
      claimId: string;
      tenantId: string | null;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
    }>,
    generatedTokens: [] as string[],
  };

  function resolveField(value: unknown, row: Record<string, unknown>) {
    switch (value) {
      case 'claims.id':
      case 'claimTrackingTokens.claimId':
        return row.claimId ?? row.id;
      case 'claims.tenantId':
      case 'claimTrackingTokens.tenantId':
        return row.tenantId;
      case 'claims.status':
        return row.status;
      case 'claims.updatedAt':
        return row.updatedAt;
      case 'claimTrackingTokens.tokenHash':
        return row.tokenHash;
      case 'claimTrackingTokens.expiresAt':
        return row.expiresAt;
      case 'claimTrackingTokens.revokedAt':
        return row.revokedAt;
      default:
        return value;
    }
  }

  function matches(where: any, row: Record<string, unknown>): boolean {
    if (!where) return true;

    switch (where.op) {
      case 'and':
        return where.args.every((clause: any) => matches(clause, row));
      case 'or':
        return where.args.some((clause: any) => matches(clause, row));
      case 'eq':
        return resolveField(where.left, row) === where.right;
      case 'gt': {
        const left = resolveField(where.left, row);
        const right = where.right;

        if (left instanceof Date && right instanceof Date) {
          return left.getTime() > right.getTime();
        }

        return Number(left) > Number(right);
      }
      case 'isNull':
        return resolveField(where.value, row) == null;
      default:
        return false;
    }
  }

  function pickColumns<T extends Record<string, unknown>>(
    row: T,
    columns?: Record<string, boolean>
  ) {
    if (!columns) {
      return { ...row };
    }

    const entries = Object.entries(columns)
      .filter(([, enabled]) => enabled)
      .map(([key]) => [key, row[key]]);

    return Object.fromEntries(entries);
  }

  const updateWhere = vi.fn(async (where: unknown) => {
    const revokedAt = new Date('2026-04-17T10:00:00.000Z');

    for (const token of store.tokens) {
      if (matches(where, token as unknown as Record<string, unknown>)) {
        token.revokedAt = revokedAt;
      }
    }
  });

  return {
    store,
    updateWhere,
    withServerActionInstrumentation: vi.fn(
      async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
    ),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: vi.fn(async (args: { where?: unknown; columns?: Record<string, boolean> }) => {
          const claim = hoisted.store.claims.find(row =>
            hoisted.updateWhere.getMockImplementation()
              ? ((): boolean => {
                  const matches = (where: any, item: Record<string, unknown>): boolean => {
                    if (!where) return true;
                    switch (where.op) {
                      case 'and':
                        return where.args.every((clause: any) => matches(clause, item));
                      case 'or':
                        return where.args.some((clause: any) => matches(clause, item));
                      case 'eq': {
                        const left =
                          where.left === 'claims.id'
                            ? item.id
                            : where.left === 'claims.tenantId'
                              ? item.tenantId
                              : where.left;
                        return left === where.right;
                      }
                      default:
                        return false;
                    }
                  };

                  return matches(args.where, row as unknown as Record<string, unknown>);
                })()
              : false
          );

          if (!claim) {
            return null;
          }

          if (!args.columns) {
            return { ...claim };
          }

          return Object.fromEntries(
            Object.entries(args.columns)
              .filter(([, enabled]) => enabled)
              .map(([key]) => [key, claim[key as keyof typeof claim]])
          );
        }),
      },
      claimTrackingTokens: {
        findFirst: vi.fn(async (args: { where?: unknown }) => {
          const matches = (where: any, item: Record<string, unknown>): boolean => {
            if (!where) return true;
            switch (where.op) {
              case 'and':
                return where.args.every((clause: any) => matches(clause, item));
              case 'or':
                return where.args.some((clause: any) => matches(clause, item));
              case 'eq': {
                const left =
                  where.left === 'claimTrackingTokens.claimId'
                    ? item.claimId
                    : where.left === 'claimTrackingTokens.tenantId'
                      ? item.tenantId
                      : where.left === 'claimTrackingTokens.tokenHash'
                        ? item.tokenHash
                        : where.left;
                return left === where.right;
              }
              case 'gt':
                return (
                  (where.left === 'claimTrackingTokens.expiresAt' ? item.expiresAt : where.left) >
                  where.right
                );
              case 'isNull':
                return (
                  (where.value === 'claimTrackingTokens.revokedAt'
                    ? item.revokedAt
                    : where.value === 'claimTrackingTokens.tenantId'
                      ? item.tenantId
                      : where.value) == null
                );
              default:
                return false;
            }
          };

          const token = hoisted.store.tokens.find(row =>
            matches(args.where, row as unknown as Record<string, unknown>)
          );
          return token ? { ...token } : null;
        }),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: hoisted.updateWhere })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        hoisted.store.tokens.push({
          claimId: value.claimId as string,
          tenantId: (value.tenantId as string | null | undefined) ?? null,
          tokenHash: value.tokenHash as string,
          expiresAt: value.expiresAt as Date,
          revokedAt: null,
        });
      }),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    status: 'claims.status',
    updatedAt: 'claims.updatedAt',
  },
  claimTrackingTokens: {
    claimId: 'claimTrackingTokens.claimId',
    tenantId: 'claimTrackingTokens.tenantId',
    tokenHash: 'claimTrackingTokens.tokenHash',
    expiresAt: 'claimTrackingTokens.expiresAt',
    revokedAt: 'claimTrackingTokens.revokedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  gt: vi.fn((left: unknown, right: unknown) => ({ op: 'gt', left, right })),
  isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
}));

vi.mock('../utils', () => ({
  buildClaimVisibilityWhere: vi.fn(({ tenantId }: { tenantId: string }) => ({
    op: 'eq',
    left: 'claims.tenantId',
    right: tenantId,
  })),
}));

vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: hoisted.withServerActionInstrumentation,
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({
      toString: () => hoisted.store.generatedTokens.shift() ?? 'generated-token',
    })),
    createHash: vi.fn(() => ({
      update: (value: string) => ({
        digest: () => `hash:${value}`,
      }),
    })),
  },
}));

import { createPublicTrackingLink } from './createPublicTrackingLink';
import { getPublicClaimStatus } from './getPublicClaimStatus';

describe('tracking link lifecycle', () => {
  beforeEach(() => {
    hoisted.store.claims = [
      {
        id: 'claim-1',
        tenantId: 'tenant-ks',
        status: 'evaluation',
        updatedAt: new Date('2026-04-10T09:00:00.000Z'),
      },
    ];
    hoisted.store.tokens = [
      {
        claimId: 'claim-1',
        tenantId: 'tenant-ks',
        tokenHash: 'hash:old-live-token',
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        revokedAt: null,
      },
      {
        claimId: 'claim-1',
        tenantId: null,
        tokenHash: 'hash:legacy-null-tenant-token',
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ];
    hoisted.store.generatedTokens = ['fresh-live-token'];
    vi.clearAllMocks();
  });

  it('invalidates prior links on regeneration and revokes legacy null-tenant rows', async () => {
    await expect(getPublicClaimStatus('old-live-token')).resolves.toEqual(
      expect.objectContaining({
        claimId: 'claim-1',
        status: 'evaluation',
      })
    );

    const result = await createPublicTrackingLink('claim-1', {
      tenantId: 'tenant-ks',
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: null,
    });

    expect(result.url).toBe('http://localhost:3000/track/fresh-live-token');
    await expect(getPublicClaimStatus('old-live-token')).resolves.toBeNull();
    await expect(getPublicClaimStatus('fresh-live-token')).resolves.toEqual(
      expect.objectContaining({
        claimId: 'claim-1',
        status: 'evaluation',
      })
    );

    expect(
      hoisted.store.tokens.find(token => token.tokenHash === 'hash:legacy-null-tenant-token')
        ?.revokedAt
    ).toBeInstanceOf(Date);
  });
});
