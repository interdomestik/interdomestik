import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyNeutralOtpRequest,
  evaluateNeutralOtpHost,
  evaluateNeutralOtpOrigin,
  extractNeutralOtpEmail,
  neutralOtpPathKind,
} from './neutral-otp-boundary';

afterEach(() => vi.unstubAllEnvs());

describe('IDA-UI03a0b2 neutral OTP boundary', () => {
  it('C01 recognizes only the exact sign-in send and verify paths', () => {
    expect(
      classifyNeutralOtpRequest(
        'https://ida.interdomestik.com/api/auth/email-otp/send-verification-otp',
        {
          email: 'member@example.com',
          type: 'sign-in',
        }
      )
    ).toBe('send');
    expect(
      classifyNeutralOtpRequest('https://ida.interdomestik.com/api/auth/sign-in/email-otp', {
        email: 'member@example.com',
        otp: '123456',
      })
    ).toBe('verify');
    expect(neutralOtpPathKind('https://ida.interdomestik.com/api/auth/sign-in/email-otp')).toBe(
      'verify'
    );
  });

  it('C02 rejects suffix, wrong-type, malformed and unrelated routes', () => {
    expect(
      classifyNeutralOtpRequest(
        'https://ida.interdomestik.com/api/auth/email-otp/send-verification-otp/extra',
        {
          email: 'member@example.com',
          type: 'sign-in',
        }
      )
    ).toBeNull();
    expect(
      classifyNeutralOtpRequest(
        'https://ida.interdomestik.com/api/auth/email-otp/send-verification-otp',
        {
          email: 'member@example.com',
          type: 'email-verification',
        }
      )
    ).toBeNull();
    expect(classifyNeutralOtpRequest('not a url', {})).toBeNull();
    expect(extractNeutralOtpEmail({ email: ' Member@Example.com ' })).toBe('member@example.com');
    expect(extractNeutralOtpEmail({ email: '   ' })).toBeNull();
  });

  it('C03 accepts the fixed hosts and refuses custom IDA_HOST values', () => {
    vi.stubEnv('IDA_HOST', 'https://otp.internal.example:8443');
    for (const host of [
      'ida.interdomestik.com',
      'ida.localhost:3000',
      'ida.127.0.0.1.nip.io:3000',
    ]) {
      expect(evaluateNeutralOtpHost(new Headers({ host }))).toBe(true);
    }
    expect(evaluateNeutralOtpHost(new Headers({ host: 'ida.attacker.example' }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: 'preview.vercel.app' }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: 'otp.internal.example' }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: 'otp.internal.example:8443' }))).toBe(false);
    for (const host of [
      'attacker@ida.interdomestik.com',
      'ida.interdomestik.com/path',
      'https://ida.interdomestik.com',
      'ida.interdomestik.com:8443',
      'ida.interdomestik.com:99999',
    ]) {
      expect(evaluateNeutralOtpHost(new Headers({ host }))).toBe(false);
    }
    vi.stubEnv('IDA_HOST', 'ida.interdomestik.com:8443');
    expect(evaluateNeutralOtpHost(new Headers({ host: 'ida.interdomestik.com:8443' }))).toBe(false);
  });

  it('admits only the portless staging door in the staging release class', () => {
    const host = 'staging.interdomestik.com';
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'staging');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', undefined);
    vi.stubEnv('IDA_HOST', 'ks.staging.interdomestik.com');

    expect(evaluateNeutralOtpHost(new Headers({ host, 'x-forwarded-host': host }))).toBe(true);
    expect(evaluateNeutralOtpHost(new Headers({ host: `${host}:443` }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: `${host}.` }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: 'ks.staging.interdomestik.com' }))).toBe(
      false
    );
    expect(evaluateNeutralOtpHost(new Headers({ host, 'x-forwarded-host': `${host}:443` }))).toBe(
      false
    );
    expect(
      evaluateNeutralOtpHost(
        new Headers({ host, 'x-forwarded-host': 'ks.staging.interdomestik.com' })
      )
    ).toBe(false);

    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '1');
    expect(evaluateNeutralOtpHost(new Headers({ host }))).toBe(false);

    vi.stubEnv('INTERDOMESTIK_PRODUCTION', undefined);
    vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'development');
    vi.stubEnv('VERCEL', undefined);
    vi.stubEnv('VERCEL_URL', undefined);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('VERCEL_TARGET_ENV', undefined);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgres://fixture@127.0.0.1/interdomestik_test');
    vi.stubEnv('DATABASE_URL_RLS', 'postgres://fixture_rls@127.0.0.1/interdomestik_test');
    expect(evaluateNeutralOtpHost(new Headers({ host }))).toBe(false);
    for (const localHost of ['ida.localhost:3000', 'ida.127.0.0.1.nip.io:3000']) {
      expect(evaluateNeutralOtpHost(new Headers({ host: localHost }))).toBe(true);
    }
  });

  it('C04 requires direct Host approval and lets forwarded host restrict but never grant', () => {
    expect(
      evaluateNeutralOtpHost(
        new Headers({ host: 'attacker.example', 'x-forwarded-host': 'ida.interdomestik.com' })
      )
    ).toBe(false);
    expect(
      evaluateNeutralOtpHost(
        new Headers({ host: 'ida.interdomestik.com', 'x-forwarded-host': 'attacker.example' })
      )
    ).toBe(false);
    expect(
      evaluateNeutralOtpHost(
        new Headers({ host: 'ida.interdomestik.com', 'x-forwarded-host': 'ida.interdomestik.com' })
      )
    ).toBe(true);
    expect(
      evaluateNeutralOtpHost(
        new Headers({
          host: 'ida.127.0.0.1.nip.io:3000',
          'x-forwarded-host': 'ida.127.0.0.1.nip.io:3001',
        })
      )
    ).toBe(false);
  });

  it('C04a requires an exact same-origin browser request', () => {
    const request = (
      origin?: string,
      fetchSite?: string,
      host = 'ida.interdomestik.com',
      url = 'https://127.0.0.1:3000/api/auth/sign-in/email-otp',
      forwardedProto?: string
    ) =>
      new Request(url, {
        method: 'POST',
        headers: {
          host,
          ...(origin ? { origin } : {}),
          ...(fetchSite ? { 'sec-fetch-site': fetchSite } : {}),
          ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
        },
      });
    expect(evaluateNeutralOtpOrigin(request('https://ida.interdomestik.com'))).toBe(true);
    expect(evaluateNeutralOtpOrigin(request('https://ida.interdomestik.com', 'same-origin'))).toBe(
      true
    );
    expect(
      evaluateNeutralOtpOrigin(
        request(
          'https://ida.interdomestik.com',
          'same-origin',
          'ida.interdomestik.com',
          'http://127.0.0.1:3000/api/auth/sign-in/email-otp',
          'https'
        )
      )
    ).toBe(true);
    expect(evaluateNeutralOtpOrigin(request())).toBe(false);
    expect(evaluateNeutralOtpOrigin(request('null'))).toBe(false);
    expect(evaluateNeutralOtpOrigin(request('https://attacker.example'))).toBe(false);
    expect(
      evaluateNeutralOtpOrigin(request('https://ida.interdomestik.com', undefined, 'ida.localhost'))
    ).toBe(false);
    expect(evaluateNeutralOtpOrigin(request('http://ida.interdomestik.com'))).toBe(false);
    expect(
      evaluateNeutralOtpOrigin(
        request(
          'https://ida.interdomestik.com',
          undefined,
          'ida.interdomestik.com',
          'http://127.0.0.1:3000/api/auth/sign-in/email-otp',
          'https, http'
        )
      )
    ).toBe(false);
    expect(evaluateNeutralOtpOrigin(request('not an origin'))).toBe(false);
    expect(evaluateNeutralOtpOrigin(request('https://ida.interdomestik.com', 'cross-site'))).toBe(
      false
    );
  });
});
