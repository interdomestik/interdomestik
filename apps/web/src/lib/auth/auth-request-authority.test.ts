import { describe, expect, it, vi } from 'vitest';

import { AUTHORITY_FIELDS, AUTHORITY_INTENT_KEY } from './authority-fields';
import { applyAuthRequestAuthority } from './auth-request-authority';

const headers = new Headers({ host: 'ida.localhost:3000' });
const onboarding = { tenant: 'tenant_ks', mode: 'deferred' };

async function rejection(body: object) {
  try {
    await applyAuthRequestAuthority({ path: '/update-user', body, headers });
  } catch (error) {
    return error as { body?: { code?: string } };
  }
  throw new Error('Expected authority rejection');
}

describe('Better Auth request authority boundary', () => {
  it('C04 rejects every own, falsy, undefined and inherited authority field', async () => {
    for (const field of AUTHORITY_FIELDS) {
      for (const value of ['super_admin', null, false, '', 0, undefined]) {
        expect((await rejection({ [field]: value })).body?.code).toBe(
          'AUTHORITY_FIELD_NOT_WRITABLE'
        );
      }
      const inherited = Object.create({ [field]: 'super_admin' }) as object;
      expect((await rejection(inherited)).body?.code).toBe('AUTHORITY_FIELD_NOT_WRITABLE');
      const nullPrototype = Object.assign(Object.create(null), { [field]: undefined });
      expect((await rejection(nullPrototype)).body?.code).toBe('AUTHORITY_FIELD_NOT_WRITABLE');
    }
  });

  it('C02 strips hostile create fields and installs only a server-issued intent', async () => {
    const body: Record<string, unknown> = {
      email: 'new@example.com',
      onboarding,
      role: 'super_admin',
      tenantId: 'tenant_mk',
      referralCode: 'owned',
    };
    await applyAuthRequestAuthority({ path: '/sign-up/email', body, headers, now: 1000 });

    expect(body).toMatchObject({ email: 'new@example.com' });
    for (const field of AUTHORITY_FIELDS) expect(field in body).toBe(false);
    expect('onboarding' in body).toBe(false);
    expect(body[AUTHORITY_INTENT_KEY]).toMatchObject({
      version: 1,
      tenant: 'tenant_ks',
      mode: 'deferred',
    });
  });

  it('C07 rejects new OTP users without intent but permits existing sign-in', async () => {
    const findUserByEmail = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ user: {} });
    await expect(
      applyAuthRequestAuthority({
        path: '/sign-in/email-otp',
        body: { email: 'new@example.com', otp: '123456' },
        headers,
        findUserByEmail,
      })
    ).rejects.toMatchObject({ body: { code: 'INVALID_ONBOARDING_CONTEXT' } });
    await expect(
      applyAuthRequestAuthority({
        path: '/sign-in/email-otp',
        body: { email: 'old@example.com', otp: '123456' },
        headers,
        findUserByEmail,
      })
    ).resolves.toBeUndefined();
  });

  it('C08 replaces all caller OAuth additionalData with one issued envelope', async () => {
    const body: Record<string, unknown> = {
      provider: 'github',
      additionalData: { onboarding, role: 'super_admin', expiresAt: 0 },
    };
    await applyAuthRequestAuthority({ path: '/sign-in/social', body, headers, now: 1000 });
    expect(body.additionalData).toEqual({
      [AUTHORITY_INTENT_KEY]: expect.objectContaining({ tenant: 'tenant_ks', mode: 'deferred' }),
    });
  });
});
