import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readTenantAuthority: vi.fn(),
  withTenantAuthority: vi.fn(),
}));

vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: mocks.readTenantAuthority,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withTenantAuthority,
}));

import { getExchangeRateInForce } from './rate-in-force';

const rate = { id: 'rate-b', tenantId: 'tenant-b', effectiveOn: '2026-01-07' };

describe('exchange rate in force', () => {
  beforeEach(() => vi.resetAllMocks());

  it('refuses a cross-tenant session before it can read an eligible rate', async () => {
    const authority = mintTestTenantAuthority('tenant-a', { accessTenantId: 'tenant-b' });
    mocks.readTenantAuthority.mockReturnValue({
      purpose: 'session',
      tenantId: 'tenant-a',
      accessTenantId: 'tenant-b',
    });
    const select = vi.fn(() => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [rate] }) }) }),
    }));
    mocks.withTenantAuthority.mockImplementation((_authority, run) => run({ select }));

    expect(await getExchangeRateInForce(authority, new Date('2026-01-08T00:00:00Z'))).toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('uses one cutoff for scheduled work when the caller advances the date', async () => {
    const authority = mintTestTenantAuthority('tenant-b');
    const instant = new Date('2026-01-07T23:00:00Z');
    mocks.readTenantAuthority.mockReturnValue({
      purpose: 'scheduled-work',
      tenantId: 'tenant-b',
      accessTenantId: 'tenant-b',
    });
    const where = vi.fn<(_predicate: SQL) => unknown>(() => ({
      orderBy: () => ({ limit: () => [rate] }),
    }));
    mocks.withTenantAuthority.mockImplementation(async (_authority, run) => {
      await Promise.resolve();
      return run({ select: () => ({ from: () => ({ where }) }) });
    });

    const result = getExchangeRateInForce(authority, instant);
    instant.setUTCDate(9);

    expect(await result).toEqual({ ok: true, rate });
    const [predicate] = where.mock.calls[0];
    expect(new PgDialect().sqlToQuery(predicate).params).toEqual([
      'tenant-b',
      '2026-01-07T23:00:00.000Z',
      '2026-01-08',
    ]);
  });
});
