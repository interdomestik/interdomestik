import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LOCALES } from '@/i18n/locales';

vi.mock('@/i18n/routing', () => ({ routing: { locales: LOCALES } }));
vi.mock('@/lib/telemetry', () => ({ emitAuthTelemetryEvent: vi.fn() }));

import { proxy } from './proxy-logic';

const ORIGINAL_CUTOVER_FLAG = process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER;
const ORIGINAL_IDA_HOST = process.env.IDA_HOST;

function restoreEnv(): void {
  if (ORIGINAL_CUTOVER_FLAG === undefined) {
    delete process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER;
  } else {
    process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER = ORIGINAL_CUTOVER_FLAG;
  }
  if (ORIGINAL_IDA_HOST === undefined) {
    delete process.env.IDA_HOST;
  } else {
    process.env.IDA_HOST = ORIGINAL_IDA_HOST;
  }
}

function makeRequest(pathname: string, cookieHeader?: string, host = 'ks.localhost:3000') {
  const headers = new Headers({ host });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://${host}${pathname}`, { headers });
}

describe('proxy ida live-login cutover', () => {
  beforeEach(() => {
    process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it.each([
    ['ks.localhost:3000', 'tenant_ks'],
    ['mk.localhost:3000', 'tenant_mk'],
    ['al.localhost:3000', 'tenant_al'],
    ['pilot.localhost:3000', 'pilot-mk'],
  ])(
    '301 redirects %s to ida.localhost with default booking tenant',
    async (host, defaultBookingTenantId) => {
      const response = await proxy(makeRequest('/sq/login?next=%2Fsq%2Fmember', undefined, host));

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        `http://ida.localhost:3000/sq/login?next=%2Fsq%2Fmember&default_booking_tenant_id=${defaultBookingTenantId}`
      );
      expect(response.headers.get('x-ida-live-login-cutover')).toBe('country-host-redirect');
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  );

  it('redirects protected country-host routes to ida before auth bounce logic', async () => {
    const response = await proxy(
      makeRequest(
        '/sq/member',
        'tenantId=tenant_mk; better-auth.session_token=stale',
        'ks.localhost:3000'
      )
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'http://ida.localhost:3000/sq/member?default_booking_tenant_id=tenant_ks'
    );
    expect(response.headers.get('x-auth-guard')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('uses configured IDA_HOST as the cutover redirect target', async () => {
    process.env.IDA_HOST = 'https://login.interdomestik.test';

    const response = await proxy(makeRequest('/mk/login', undefined, 'mk.localhost:3000'));

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://login.interdomestik.test/mk/login?default_booking_tenant_id=tenant_mk'
    );
  });

  it('does not redirect hostile country-label lookalikes', async () => {
    const response = await proxy(makeRequest('/sq/login', undefined, 'ks.evil.test'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-ida-live-login-cutover')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
