import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyNeutralOtpRequest,
  evaluateNeutralOtpHost,
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

  it('C03 accepts only canonical/local IDA hosts and the exact configured IDA_HOST', () => {
    vi.stubEnv('IDA_HOST', 'https://otp.internal.example:8443');
    for (const host of [
      'ida.interdomestik.com',
      'ida.localhost:3000',
      'ida.127.0.0.1.nip.io:3000',
      'otp.internal.example:8443',
    ]) {
      expect(evaluateNeutralOtpHost(new Headers({ host }))).toBe(true);
    }
    expect(evaluateNeutralOtpHost(new Headers({ host: 'ida.attacker.example' }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: 'preview.vercel.app' }))).toBe(false);
    expect(evaluateNeutralOtpHost(new Headers({ host: 'otp.internal.example' }))).toBe(false);
    for (const host of [
      'attacker@ida.interdomestik.com',
      'ida.interdomestik.com/path',
      'https://ida.interdomestik.com',
      'ida.interdomestik.com:99999',
    ]) {
      expect(evaluateNeutralOtpHost(new Headers({ host }))).toBe(false);
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
});
