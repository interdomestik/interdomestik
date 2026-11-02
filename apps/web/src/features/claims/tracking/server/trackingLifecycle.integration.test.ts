import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTrackingDrizzleMock, trackingSchemaMock } from './tracking-test-mocks';
import {
  type ClaimRow,
  type ColumnMap,
  findClaim,
  findToken,
  matches,
  type TokenRow,
  type WhereClause,
} from './trackingLifecycle.test-support';

const hoisted = vi.hoisted(() => {
  const store = {
    claims: [] as ClaimRow[],
    tokens: [] as TokenRow[],
    generatedTokens: [] as string[],
  };

  const updateWhere = vi.fn(async (where: unknown) => {
    const revokedAt = new Date('2026-04-17T10:00:00.000Z');

    for (const token of store.tokens) {
      if (matches(where as WhereClause, token)) {
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

vi.mock('@interdomestik/database', () => {
  const db = {
    query: {
      claims: {
        findFirst: vi.fn(async (args: { where?: WhereClause; columns?: ColumnMap }) =>
          findClaim(hoisted.store.claims, args)
        ),
      },
      claimTrackingTokens: {
        findFirst: vi.fn(async (args: { where?: WhereClause }) =>
          findToken(hoisted.store.tokens, args)
        ),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((where: WhereClause) => ({
          limit: vi.fn(async (count: number) =>
            hoisted.store.tokens
              .filter(token => matches(where, token))
              .slice(0, count)
              .map(() => ({ id: 'token-row' }))
          ),
        })),
      })),
    })),
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
  };
  return {
    db,
    withTenantContext: (
      _context: { tenantId: string },
      action: (tx: typeof db) => Promise<unknown>
    ) => action(db),
    resolveClaimTrackingTokenTenant: vi.fn(async (rawToken: string, now: Date) => {
      const rows = hoisted.store.tokens.filter(
        token =>
          token.tokenHash === `hash:${rawToken}` &&
          token.tenantId !== null &&
          token.expiresAt.getTime() > now.getTime() &&
          token.revokedAt === null
      );
      return rows.length === 1 ? { tenantId: rows[0].tenantId, claimId: rows[0].claimId } : null;
    }),
  };
});

vi.mock('@interdomestik/database/schema', () => trackingSchemaMock);

vi.mock('drizzle-orm', () => createTrackingDrizzleMock());

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T09:00:00.000Z'));

    hoisted.store.claims = [
      {
        id: 'claim-1',
        caseLifecycleState: 'evaluation',
        recoveryLifecycleState: 'not_started',
        tenantId: 'tenant-ks',
        updatedAt: new Date('2026-04-10T09:00:00.000Z'),
      },
    ];
    hoisted.store.tokens = [
      {
        claimId: 'claim-1',
        tenantId: 'tenant-ks',
        tokenHash: 'hash:old-live-token',
        expiresAt: new Date('2099-05-01T00:00:00.000Z'),
        revokedAt: null,
      },
      {
        claimId: 'claim-1',
        tenantId: null,
        tokenHash: 'hash:legacy-null-tenant-token',
        expiresAt: new Date('2099-05-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ];
    hoisted.store.generatedTokens = ['fresh-live-token'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('invalidates prior links on regeneration and revokes legacy null-tenant rows', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');

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
