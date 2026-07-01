import { expect, test } from '@playwright/test';

import { getLocale, getRootURL, path } from '../fixtures/routes';

type CountryHostCase = {
  label: 'ks' | 'mk' | 'al' | 'pilot';
  defaultBookingTenantId: string;
};

const COUNTRY_HOSTS: readonly CountryHostCase[] = [
  { label: 'ks', defaultBookingTenantId: 'tenant_ks' },
  { label: 'mk', defaultBookingTenantId: 'tenant_mk' },
  { label: 'al', defaultBookingTenantId: 'tenant_al' },
  { label: 'pilot', defaultBookingTenantId: 'pilot-mk' },
];

const isLiveLoginCutoverEnabled = process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER === 'true';

function countryHostCase(hostname: string): CountryHostCase | null {
  return COUNTRY_HOSTS.find(country => hostname.startsWith(`${country.label}.`)) ?? null;
}

function idaHostnameFor(hostname: string, label: CountryHostCase['label']): string {
  return hostname.replace(new RegExp(`^${label}\\.`), 'ida.');
}

test.describe('ida live-login cutover gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('country host redirects to ida with default booking hint', async ({ request }, testInfo) => {
    const origin = getRootURL(testInfo);
    const locale = getLocale(testInfo);
    const hostCase = countryHostCase(new URL(origin).hostname);
    test.skip(hostCase === null, 'live-login cutover gate only runs on country-host projects');
    if (!hostCase) {
      throw new Error('unreachable: live-login cutover skip did not abort the test');
    }

    const loginUrl = new URL(path(testInfo, '/login'));
    const nextPath = `/${locale}/member`;
    loginUrl.searchParams.set('next', nextPath);
    const response = await request.get(loginUrl.toString(), { maxRedirects: 0 });
    const location = response.headers()['location'];

    if (!isLiveLoginCutoverEnabled) {
      expect(response.status()).not.toBe(301);
      expect(location ?? '').not.toContain('default_booking_tenant_id=');
      expect(location ?? '').not.toContain('ida.');
      expect(response.headers()['set-cookie'] ?? '').toContain(
        `tenantId=${hostCase.defaultBookingTenantId}`
      );
      return;
    }

    const redirectUrl = new URL(location ?? '');
    expect(response.status()).toBe(301);
    expect(redirectUrl.hostname).toBe(idaHostnameFor(new URL(origin).hostname, hostCase.label));
    expect(redirectUrl.pathname).toBe(`/${locale}/login`);
    expect(redirectUrl.searchParams.get('next')).toBe(nextPath);
    expect(redirectUrl.searchParams.get('default_booking_tenant_id')).toBe(
      hostCase.defaultBookingTenantId
    );
    expect(response.headers()['set-cookie'] ?? '').not.toContain('tenantId=');
  });
});
