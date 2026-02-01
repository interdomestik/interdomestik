import { expect, test } from '@playwright/test';
import { getLocale, routes } from '../routes';

test.describe('Locale Helper Guard Tests', () => {
  test('getLocale extracts from TestInfo correctly', async ({}, testInfo) => {
    // 1. Mock TestInfo-like object if needed, but we have real testInfo here
    const locale = getLocale(testInfo);
    expect(['sq', 'en', 'mk', 'sr', 'de', 'hr']).toContain(locale);
  });

  test('getLocale throws on invalid string', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getLocale('invalid' as any)).toThrow(/Invalid locale string/);
  });

  test('getLocale throws on arbitrary object', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getLocale({ some: 'object' } as any)).toThrow(
      /Contract Violation: Expected string or TestInfo, received object/
    );
  });

  test('routes helpers handle TestInfo correctly', async ({}, testInfo) => {
    const loginPath = routes.login(testInfo);
    const locale = getLocale(testInfo);
    expect(loginPath).toBe(`/${locale}/login`);
  });
});
