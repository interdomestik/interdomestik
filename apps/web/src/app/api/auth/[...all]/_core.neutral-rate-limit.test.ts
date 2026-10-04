import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAuthRateLimitKeySuffix } from './_core';

const EMAIL = 'member.mk@interdomestik.test';
const URL = 'https://www.interdomestik.com/api/auth/sign-in/email';

function suffix(headers: Record<string, string> = {}, body: unknown = { email: EMAIL }, url = URL) {
  return getAuthRateLimitKeySuffix({
    method: 'POST',
    url,
    headers: new Headers({ host: 'www.interdomestik.com', ...headers }),
    body,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('neutral email sign-in rate-limit identity', () => {
  it.each([
    '',
    'tenantId=tenant_ks',
    'tenantId=tenant_mk',
    'tenantId=pilot-mk',
    'tenantId=tenant_al',
    'tenantId=unknown',
    'tenantId=%E0%A4%A',
  ])('keeps one identity across explicit and booking hints with cookie %o', cookie => {
    const expected = suffix();
    expect(expected).toMatch(/^neutral:email_hash:[a-f0-9]{20}$/);

    for (const tenantId of ['tenant_ks', 'tenant_mk', 'pilot-mk', 'tenant_al', 'unknown']) {
      expect(suffix({ cookie, 'x-tenant-id': tenantId })).toBe(expected);
      expect(suffix({ cookie }, { email: EMAIL, additionalData: { tenantId } })).toBe(expected);
      expect(
        suffix(
          { cookie },
          { email: EMAIL, additionalData: { default_booking_tenant_id: tenantId } }
        )
      ).toBe(expected);
      expect(suffix({ cookie }, { email: EMAIL }, `${URL}?tenantId=${tenantId}`)).toBe(expected);
    }
    expect(suffix({ cookie }, { email: EMAIL, additionalData: 'malformed' })).toBe(expected);
    expect(
      suffix(
        { cookie, 'x-tenant-id': 'tenant_mk' },
        { email: EMAIL, additionalData: { tenantId: 'tenant_ks' } }
      )
    ).toBe(expected);
  });

  it('normalizes the identity, separates accounts, and omits raw email and tenant', () => {
    const key = suffix();
    expect(suffix({}, { email: '  MEMBER.MK@INTERDOMESTIK.TEST ' })).toBe(key);
    expect(suffix({}, { email: 'another@interdomestik.test' })).not.toBe(key);
    expect(key).not.toContain(EMAIL);
    expect(key).not.toContain('tenant');
  });

  it.each(['interdomestik.com', 'ida.interdomestik.com', 'ida.localhost:3000'])(
    'uses the same identity on admitted neutral host %s',
    host => expect(suffix({ host, cookie: 'tenantId=tenant_al' })).toBe(suffix())
  );

  it('uses the same identity on an exact configured neutral host', () => {
    vi.stubEnv('IDA_HOST', 'https://front-door.example.test');
    expect(suffix({ host: 'front-door.example.test', cookie: 'tenantId=tenant_mk' })).toBe(
      suffix()
    );
  });

  it.each([null, {}, { email: null }, { email: 12 }, { email: '' }, { email: '  ' }])(
    'preserves the IP fallback for unusable email body %o',
    body => expect(suffix({ cookie: 'tenantId=tenant_ks' }, body)).toBeNull()
  );

  it('preserves legacy country keys and does not admit rejected neutral hosts', () => {
    vi.stubEnv('FEATURE_IDA_LIVE_LOGIN_CUTOVER', 'false');
    expect(suffix({ host: 'ks.interdomestik.com' })).toMatch(/^tenant:tenant_ks:email_hash:/);
    expect(suffix({ host: 'mk.interdomestik.com' })).toMatch(/^tenant:tenant_mk:email_hash:/);
    expect(suffix({ host: 'ida.evil.example', cookie: 'tenantId=tenant_mk' })).toMatch(
      /^tenant:tenant_mk:email_hash:/
    );
    expect(suffix({ host: 'ida.interdomestik.com:8443', cookie: 'tenantId=tenant_ks' })).toMatch(
      /^tenant:tenant_ks:email_hash:/
    );
  });

  it('preserves blocked country-host cutover behavior', () => {
    vi.stubEnv('FEATURE_IDA_LIVE_LOGIN_CUTOVER', 'true');
    expect(suffix({ host: 'ks.interdomestik.com', cookie: 'tenantId=tenant_mk' })).toBeNull();
  });
});
