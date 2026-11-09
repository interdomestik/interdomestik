import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  activate: vi.fn(),
  hasCredential: vi.fn(),
}));

vi.mock('@interdomestik/domain-communications/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/member-activation-invite', () => ({ sendMemberActivationInvite: h.activate }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({
  coerceTenantId: (id: string) => (id === 'tenant_ks' ? id : null),
  preferredLocaleForTenant: () => 'en',
  resolveTenantAppOrigin: () => 'https://tenant.example',
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/roster-crypto', () => ({
  readSponsorRosterSecret: () => 'x'.repeat(32),
}));
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

describe('sponsor mail adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
