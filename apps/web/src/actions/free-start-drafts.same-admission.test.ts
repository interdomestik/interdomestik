import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withRequestAdmission } from '@/lib/privacy/require-member-acceptance';

import { createFreeStartDraft } from './free-start-drafts';
import { createFreeStartDraftCore } from './free-start-drafts/lifecycle.core';
import { resolveFreeStartDraftSession } from './free-start-drafts/session.core';

// Only the outer boundaries are mocked; session resolution, admission and entitlement are real.
const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  readOwnAcceptanceState: vi.fn(),
  getSession: vi.fn(),
  hasActiveMembership: vi.fn(),
  readIntakeOpen: vi.fn(),
  createDraft: vi.fn(),
  neutralHost: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('@interdomestik/domain-privacy/acceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-privacy/acceptance')>()),
  readOwnAcceptanceState: mocks.readOwnAcceptanceState,
}));
vi.mock('@interdomestik/database/tenant-authority', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-authority')>();
  return {
    ...actual,
    readTenantAuthority: (authority: Parameters<typeof actual.readTenantAuthority>[0]) => ({
      ...actual.readTenantAuthority(authority),
      purpose: 'session',
    }),
  };
});
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/auth/[...all]/neutral-otp-boundary', () => ({
  evaluateNeutralOtpHost: mocks.neutralHost,
}));
vi.mock('@/lib/tenant/tenant-hosts', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/tenant/tenant-hosts')>()),
  resolveDefaultPublicTenantId: () => 'tenant_ks',
}));
vi.mock('@/lib/tenant/tenant-session-context', () => ({
  resolveSessionTenantConcepts: () => ({ accessTenantId: 'tenant_ks' }),
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  hasActiveMembership: mocks.hasActiveMembership,
}));
vi.mock('@interdomestik/database/free-start-drafts', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/free-start-drafts')>()),
  createFreeStartDraft: mocks.createDraft,
  readFreeStartDraftIntakeOpen: mocks.readIntakeOpen,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => headers }));

const headers = vi.hoisted(() => new Headers({ host: 'ida.interdomestik.com' }));
const user = { id: 'owner-a', role: 'member', tenantId: 'tenant_ks' };
const input = () => ({
  category: 'vehicle',
  clientRequestId: randomUUID(),
  expectedContext: { ownerUserId: user.id, tenantId: user.tenantId },
  resumeStep: 'details',
  summary: 'Supported facts.',
});

function signIn() {
  const authorized = {
    authority: mintTestTenantAuthority(user.tenantId, { userId: user.id, role: user.role }),
    session: { user },
  };
  mocks.authorizeSessionTenant.mockResolvedValue(authorized);
  mocks.getSession.mockResolvedValue({ user: { ...user, emailVerified: true } });
  return authorized;
}

describe('free-start draft writes share one request admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readOwnAcceptanceState.mockResolvedValue({ accepted: true, missing: [] });
    mocks.hasActiveMembership.mockResolvedValue(true);
    mocks.readIntakeOpen.mockResolvedValue(false);
    mocks.createDraft.mockResolvedValue({ ok: false, code: 'limitReached' });
    mocks.neutralHost.mockReturnValue(true);
  });

  it('reads membership with the authority object of the draft admission itself', async () => {
    const authorized = signIn();

    await withRequestAdmission(headers, () => createFreeStartDraftCore(headers, input()));

    expect(mocks.authorizeSessionTenant).toHaveBeenCalledOnce();
    expect(mocks.hasActiveMembership).toHaveBeenCalledOnce();
    expect(mocks.hasActiveMembership.mock.calls[0]?.[0]).toBe(user.id);
    expect(mocks.hasActiveMembership.mock.calls[0]?.[1]).toBe(authorized.authority);
    expect(mocks.readIntakeOpen).not.toHaveBeenCalled();
    expect(mocks.createDraft).toHaveBeenCalledOnce();
  });

  it('refuses before entitlement or repository work when acceptance is missing', async () => {
    signIn();
    mocks.readOwnAcceptanceState.mockResolvedValue({ accepted: false, missing: [] });

    await expect(
      withRequestAdmission(headers, () => createFreeStartDraftCore(headers, input()))
    ).resolves.toEqual({ ok: false, code: 'acceptanceRequired' });

    expect(mocks.authorizeSessionTenant).toHaveBeenCalledOnce();
    expect(mocks.hasActiveMembership).not.toHaveBeenCalled();
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it('refuses a non-neutral host before any session or acceptance read', async () => {
    signIn();
    mocks.neutralHost.mockReturnValue(false);

    await expect(createFreeStartDraft(input())).resolves.toEqual({
      ok: false,
      code: 'unavailable',
    });

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.authorizeSessionTenant).not.toHaveBeenCalled();
    expect(mocks.readOwnAcceptanceState).not.toHaveBeenCalled();
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it('resolves admission from the explicit headers outside a draft scope', async () => {
    signIn();
    const outage = new Error('auth unavailable');
    mocks.authorizeSessionTenant.mockRejectedValue(outage);

    await expect(resolveFreeStartDraftSession(headers)).rejects.toBe(outage);
    expect(mocks.authorizeSessionTenant).toHaveBeenCalledExactlyOnceWith(headers);
  });
});
