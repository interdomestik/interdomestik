import { describe, expect, it } from 'vitest';

import { createAdminCrmForecastBackfillConfirmationStore } from './_backfill-confirmation';

const tuple = {
  actorId: 'admin-1',
  fromDate: '2026-05-13',
  maxWorkItemsPerDate: 10,
  tenantId: 'tenant-1',
  toDate: '2026-05-14',
};

describe('admin CRM forecast backfill confirmation store', () => {
  it('creates short-lived single-use confirmations for an exact actor and request tuple', () => {
    const store = createAdminCrmForecastBackfillConfirmationStore({
      secret: 'test-confirmation-secret-32chars',
    });
    const token = store.create(tuple, '2026-05-15T10:00:00.000Z');

    const consumed = store.consume(token, tuple, new Date('2026-05-15T10:01:00.000Z'));

    expect(consumed).toEqual({ tokenId: expect.any(String) });
    if ('tokenId' in consumed) store.finalize(consumed.tokenId);
    expect(store.consume(token, tuple, new Date('2026-05-15T10:02:00.000Z'))).toEqual({
      error: 'confirmation_invalid',
    });
  });

  it('rejects duplicate in-flight writes before a consumed confirmation is finalized', () => {
    const store = createAdminCrmForecastBackfillConfirmationStore({
      secret: 'test-confirmation-secret-32chars',
    });
    const token = store.create(tuple, '2026-05-15T10:00:00.000Z');

    expect(store.consume(token, tuple, new Date('2026-05-15T10:01:00.000Z'))).toEqual({
      tokenId: expect.any(String),
    });
    expect(store.consume(token, tuple, new Date('2026-05-15T10:01:01.000Z'))).toEqual({
      error: 'confirmation_in_flight',
    });
  });

  it('rejects expired or drifted confirmations', () => {
    const store = createAdminCrmForecastBackfillConfirmationStore({
      secret: 'test-confirmation-secret-32chars',
    });
    const token = store.create(tuple, '2026-05-15T10:00:00.000Z');

    expect(store.consume(token, tuple, new Date('2026-05-15T10:10:01.000Z'))).toEqual({
      error: 'confirmation_expired',
    });

    const secondToken = store.create(tuple, '2026-05-15T10:00:00.000Z');
    expect(
      store.consume(
        secondToken,
        { ...tuple, toDate: '2026-05-13' },
        new Date('2026-05-15T10:01:00.000Z')
      )
    ).toEqual({ error: 'confirmation_invalid' });
  });

  it('rejects tampered token signatures', () => {
    const store = createAdminCrmForecastBackfillConfirmationStore({
      secret: 'test-confirmation-secret-32chars',
    });
    const token = store.create(tuple, '2026-05-15T10:00:00.000Z');
    const tampered = `${token.slice(0, -1)}x`;

    expect(store.consume(tampered, tuple, new Date('2026-05-15T10:01:00.000Z'))).toEqual({
      error: 'confirmation_invalid',
    });
  });
});
