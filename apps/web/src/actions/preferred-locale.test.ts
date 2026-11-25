import { LOCALES } from '@/i18n/locales';
import { notificationDeliveries, userLocalePreferences } from '@interdomestik/database/schema';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { expect, it } from 'vitest';

it('keeps the app, stored locale enums and database CHECK values in sync', () => {
  expect(userLocalePreferences.locale.enumValues).toEqual(LOCALES);
  expect(notificationDeliveries.locale.enumValues).toEqual(LOCALES);

  const dialect = new PgDialect();
  for (const [table, checkName, column] of [
    [
      userLocalePreferences,
      'user_locale_preferences_locale_check',
      '"user_locale_preferences"."locale"',
    ],
    [
      notificationDeliveries,
      'notification_deliveries_locale_check',
      '"notification_deliveries"."locale"',
    ],
  ] as const) {
    const check = getTableConfig(table).checks.find(check => check.name === checkName);
    expect(check).toBeDefined();
    const allowed = LOCALES.map(locale => `'${locale}'`).join(', ');
    expect(check && dialect.sqlToQuery(check.value).sql).toBe(`${column} in (${allowed})`);
  }
});
