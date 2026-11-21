import { mintIngressCapability } from '@interdomestik/database/ingress-registrar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findTenant: vi.fn(),
  withTenantAuthority: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  dbAdmin: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.findTenant }) }) }),
  },
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withTenantAuthority,
}));

import { recordExchangeRateScheduled } from './record-exchange-rate';

const event = {
  data: {
    base: 'EUR',
    quote: 'MKD',
    rate: '61.5',
    effectiveOn: '2026-01-02',
    tenantId: 'event-tenant',
  },
};

describe('scheduled exchange-rate publication', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['', '  '])('refuses event tenant %j before any query', async tenantId => {
    const result = await recordExchangeRateScheduled(mintIngressCapability('inngest'), {
      ...event.data,
      tenantId,
    });
    expect(result).toEqual({ ok: false, code: 'forbidden' });
    expect(mocks.findTenant).not.toHaveBeenCalled();
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
  });

  it('refuses an unknown event tenant after the existence lookup', async () => {
    mocks.findTenant.mockResolvedValue([]);
    expect(await recordExchangeRateScheduled(mintIngressCapability('inngest'), event.data)).toEqual(
      {
        ok: false,
        code: 'forbidden',
      }
    );
    expect(mocks.findTenant).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
  });

  it('returns not_found without inserting when an existing event tenant lacks a book', async () => {
    mocks.findTenant.mockResolvedValue([{ id: event.data.tenantId }]);
    const lock = vi.fn().mockResolvedValue([]);
    const insert = vi.fn();
    mocks.withTenantAuthority.mockImplementation((_authority, run) =>
      run({
        select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }),
        insert,
      })
    );

    expect(await recordExchangeRateScheduled(mintIngressCapability('inngest'), event.data)).toEqual(
      {
        ok: false,
        code: 'not_found',
      }
    );
    expect(mocks.findTenant).toHaveBeenCalledExactlyOnceWith(1);
    expect(lock).toHaveBeenCalledExactlyOnceWith('update');
    expect(insert).not.toHaveBeenCalled();
  });
});
