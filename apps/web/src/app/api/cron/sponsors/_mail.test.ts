import { createHmac } from 'node:crypto';
import {
  sponsorMailInput,
  type PreparedMail,
} from '@interdomestik/domain-membership-billing/sponsors/mail-sender';
import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  activate: vi.fn(),
  hasCredential: vi.fn(),
}));

vi.mock('@interdomestik/domain-communications/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/member-activation-invite', () => ({ sendMemberActivationInvite: h.activate }));
vi.mock(
  '@interdomestik/domain-membership-billing/sponsors/roster-crypto',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@interdomestik/domain-membership-billing/sponsors/roster-crypto')
    >()),
    readSponsorRosterSecret: () => 'x'.repeat(32),
  })
);
vi.mock('@interdomestik/domain-membership-billing/sponsors/sponsor-jobs', () => ({
  sponsorCredentialCheck: () => h.hasCredential,
}));

import { sponsorMailDeps } from './_mail';

const authority = mintTestTenantAuthority('tenant_ks');
const input = {
  locale: 'en',
  firstName: 'Ana',
  supportEmail: 'help@example.test',
  companyName: 'Company',
  kind: 'sponsor_notice',
  entityName: 'Controller',
  startDate: '1 January 2027',
  termEnd: '1 January 2028',
  optOutUrl: 'https://tenant.example/sponsor/opt-out/token',
  loginUrl: 'https://tenant.example/en/login',
} satisfies Parameters<NonNullable<ReturnType<typeof sponsorMailDeps>>['sendMail']>[1];

afterEach(() => vi.unstubAllEnvs());

describe('sponsor mail adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDeploymentOrigin();
    h.sendEmail.mockResolvedValue({ success: true });
    h.activate.mockResolvedValue({ sent: true });
  });

  it('refuses an unsupported tenant without sending', () => {
    expect(sponsorMailDeps('unknown', authority)).toBeNull();
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.activate).not.toHaveBeenCalled();
  });

  it('renders the billing mail input before sending to the current recipient', async () => {
    const deps = sponsorMailDeps('tenant_ks', authority);
    expect(await deps?.sendMail('current@example.test', input)).toEqual({ ok: true });
    expect(h.sendEmail).toHaveBeenCalledExactlyOnceWith(
      'current@example.test',
      expect.objectContaining({
        subject: expect.any(String),
        html: expect.stringContaining('Controller'),
        text: expect.stringContaining('Company'),
      })
    );
    expect(h.activate).not.toHaveBeenCalled();
  });

  it('returns only the stable error code when email delivery fails', async () => {
    h.sendEmail.mockResolvedValue({ success: false, error: 'private provider response' });
    const deps = sponsorMailDeps('tenant_ks', authority);
    expect(await deps?.sendMail('current@example.test', input)).toEqual({
      ok: false,
      code: 'send_failed',
    });
  });

  it('keeps activation on the tenant-bound auth helper', async () => {
    const deps = sponsorMailDeps('tenant_ks', authority);
    expect(await deps?.sendActivation('current@example.test')).toEqual({ ok: true });
    expect(h.activate).toHaveBeenCalledExactlyOnceWith({
      email: 'current@example.test',
      tenantId: 'tenant_ks',
    });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
  it('maps suppression to a non-delivered sponsor outcome', async () => {
    h.sendEmail.mockResolvedValue({ success: false, suppressed: true, error: 'email_suppressed' });
    expect(
      await sponsorMailDeps('tenant_ks', authority)?.sendMail('member@other.invalid', input)
    ).toEqual({ ok: false, code: 'email_suppressed' });
  });
});

it('preserves activation suppression for the terminal outbox outcome', async () => {
  stubDeploymentOrigin();
  h.activate.mockResolvedValue({ sent: false, reason: 'email_suppressed' });
  expect(
    await sponsorMailDeps('tenant_ks', authority)?.sendActivation('member@other.invalid')
  ).toEqual({ ok: false, code: 'email_suppressed' });
});

const prepared: PreparedMail = {
  kind: 'sponsor_notice',
  entryId: 'entry_A-42',
  recipient: 'member@example.test',
  firstName: 'Ana',
  companyName: 'Company',
  entityName: 'Controller',
  start: new Date('2026-01-01'),
  end: new Date('2027-01-01'),
  check: { send: true },
};

it.each([
  ['production', 'https://ida.interdomestik.com'],
  ['staging', 'https://staging.interdomestik.com'],
  ['local', 'http://ida.localhost:3310'],
  ['local', 'https://ida.127.0.0.1.nip.io:3443'],
])(
  'pins sponsor destinations to the %s door while preserving signed tokens and locales',
  (environment, door) => {
    stubDeploymentOrigin(environment, door);
    const token = createHmac('sha256', 'x'.repeat(32))
      .update('sponsor-roster-opt-out\u0000entry_A-42')
      .digest('base64url');
    for (const tenant of ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk']) {
      const deps = sponsorMailDeps(tenant, mintTestTenantAuthority(tenant));
      if (!deps) throw new Error('Expected sponsor dependencies');
      expect(deps.appUrl).toBe(door);
      for (const locale of ['sq', 'en', 'sr', 'mk', 'de'] as const) {
        const localized = { ...deps, locale };
        const notice = sponsorMailInput(prepared, localized);
        expect(notice).toMatchObject({
          loginUrl: `${door}/${locale}/login`,
          optOutUrl: `${door}/sponsor/opt-out/${token}`,
        });
        expect(
          sponsorMailInput({ ...prepared, kind: 'membership_end_offer' }, localized)
        ).toMatchObject({ offerUrl: `${door}/${locale}/pricing` });
      }
    }
  }
);

it('refuses invalid sponsor origin configuration before dispatch', () => {
  stubDeploymentOrigin();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ida.interdomestik.com');
  expect(() => sponsorMailDeps('tenant_ks', authority)).toThrow();
  expect(h.sendEmail).not.toHaveBeenCalled();
});
