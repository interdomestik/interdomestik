import { describe, expect, it } from 'vitest';

import en from './en/admin-crm.json';
import mk from './mk/admin-crm.json';
import sq from './sq/admin-crm.json';
import sr from './sr/admin-crm.json';

const locales = [
  ['en', en['admin-crm'].backfill],
  ['mk', mk['admin-crm'].backfill],
  ['sq', sq['admin-crm'].backfill],
  ['sr', sr['admin-crm'].backfill],
] as const;

describe('admin CRM forecast backfill operator copy', () => {
  it.each(locales)('defines confirmation and error copy for %s', (_locale, backfill) => {
    expect(backfill.dryRun.help).toBeTruthy();
    expect(backfill.confirm.warning).toBeTruthy();
    expect(backfill.confirm.expired).toBeTruthy();
    expect(backfill.confirm.invalid).toBeTruthy();
    expect(backfill.confirm.inFlight).toBeTruthy();
    expect(backfill.result.summary).toBeTruthy();

    for (const code of [
      'unauthorized',
      'invalid_request',
      'invalid_range',
      'range_too_large',
      'date_out_of_bounds',
      'invalid_tenant',
      'confirmation_invalid',
      'confirmation_expired',
      'confirmation_in_flight',
      'rate_limited',
      'all_dates_failed',
      'partial_failure',
      'internal_error',
    ] as const) {
      expect(backfill.error[code]).toBeTruthy();
    }
  });
});
