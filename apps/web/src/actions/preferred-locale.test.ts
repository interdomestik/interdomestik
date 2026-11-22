import { LOCALES } from '@/i18n/locales';
import { notificationDeliveries, user } from '@interdomestik/database/schema';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { expect, it } from 'vitest';

it('keeps the app, stored locale enums and database CHECK values in sync', () => {
  expect(user.preferredLocale.enumValues).toEqual(LOCALES);
  expect(notificationDeliveries.locale.enumValues).toEqual(LOCALES);

  const dialect = new PgDialect();
  for (const [table, checkName, column] of [
    [user, 'user_preferred_locale_check', '"user"."preferred_locale"'],
    [
      notificationDeliveries,
      'notification_deliveries_locale_check',
      '"notification_deliveries"."locale"',
    ],
  ] as const) {
    const check = getTableConfig(table).checks.find(check => check.name === checkName);
    expect(check).toBeDefined();
    expect(check && dialect.sqlToQuery(check.value).sql).toBe(
      `${column} in (${LOCALES.map(locale => `'${locale}'`).join(', ')})`
    );
  }
});
