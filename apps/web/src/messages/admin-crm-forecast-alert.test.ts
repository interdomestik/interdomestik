import { describe, expect, it } from 'vitest';

import en from './en/admin-crm.json';
import mk from './mk/admin-crm.json';
import sq from './sq/admin-crm.json';
import sr from './sr/admin-crm.json';

const locales = [
  ['en', en['admin-crm'].forecastAlert],
  ['mk', mk['admin-crm'].forecastAlert],
  ['sq', sq['admin-crm'].forecastAlert],
  ['sr', sr['admin-crm'].forecastAlert],
] as const;

const severities = ['ok', 'warning', 'critical', 'unknown'] as const;

describe('admin CRM forecast alert copy', () => {
  it.each(locales)(
    'defines severity labels, headline copy, and explanation copy for %s',
    (_locale, forecastAlert) => {
      for (const severity of severities) {
        expect(forecastAlert.severity[severity]).toBeTruthy();
        expect(forecastAlert[severity].headline).toBeTruthy();
        expect(forecastAlert[severity].explanation).toBeTruthy();
      }

      for (const metric of [
        'expected',
        'observed',
        'missing',
        'stale',
        'deferred',
        'latestCreated',
        'latestRun',
        'none',
      ] as const) {
        expect(forecastAlert.metrics[metric]).toBeTruthy();
      }
    }
  );
});
