import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: vi.fn(),
  authorize: vi.fn(),
  resolve: vi.fn(),
  leave: vi.fn(),
  revalidate: vi.fn(),
  outlook: vi.fn(),
}));
vi.mock('@/components/shell/session', () => ({ getSessionSafe: h.session }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionUserTenant: h.authorize }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (_authority: unknown, callback: (tx: unknown) => unknown) => callback({}),
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  readSponsorOutlook: h.outlook,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/opt-out', () => ({
  leaveSponsorship: h.leave,
  listLeavableSponsorEntries: h.resolve,
}));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }));
import { leaveCompanyProgramme, getCompanyMembershipOutlook } from './leave-sponsorship.core';

const authority = mintTestTenantAuthority('tenant-ks', { userId: 'me', role: 'member' });
describe('leave company programme action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    h.session.mockResolvedValue({ user: { id: 'me', role: 'member' } });
    h.authorize.mockResolvedValue(authority);
    h.resolve.mockResolvedValue(['current-entry', 'my-entry']);
    h.leave.mockResolvedValue({ ok: true, value: { revoked: 2 } });
  });
  it('revokes the session member’s current, pending or future entry and revalidates', async () => {
    expect(await leaveCompanyProgramme({ entryId: 'my-entry' })).toEqual({ ok: true });
    expect(h.authorize).toHaveBeenCalledWith('me');
    expect(h.resolve).toHaveBeenCalledWith({}, 'tenant-ks', 'me', expect.any(Date));
    expect(h.leave).toHaveBeenCalledWith(
      authority,
      { userId: 'me' },
      { entryId: 'my-entry', now: expect.any(Date) }
    );
    expect(h.revalidate).toHaveBeenCalledWith('/[locale]/member/membership', 'page');
  });
  it.each([null, { user: { id: 'me', role: 'agent' } }, { user: { id: 'me' } }])(
    'refuses missing session or member role',
    async session => {
      h.session.mockResolvedValue(session);
      expect(await leaveCompanyProgramme({ entryId: 'my-entry' })).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect(h.leave).not.toHaveBeenCalled();
    }
  );
  it('refuses absent own-session authority', async () => {
    h.authorize.mockResolvedValue(null);
    expect(await leaveCompanyProgramme({ entryId: 'my-entry' })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(h.resolve).not.toHaveBeenCalled();
  });
  it('refuses another person’s entry before invoking the mutation', async () => {
    expect(await leaveCompanyProgramme({ entryId: 'other-entry' })).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(h.leave).not.toHaveBeenCalled();
  });
  it('refuses when the member has no live sponsored entry', async () => {
    h.resolve.mockResolvedValue([]);
    expect(await leaveCompanyProgramme({ entryId: 'my-entry' })).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(h.leave).not.toHaveBeenCalled();
  });
  it('preserves a domain not_found result without revalidation', async () => {
    h.leave.mockResolvedValue({ ok: false, error: 'not_found' });
    expect(await leaveCompanyProgramme({ entryId: 'my-entry' })).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(h.revalidate).not.toHaveBeenCalled();
  });
  it('returns a bounded error without provider details', async () => {
    h.leave.mockRejectedValue(new Error('private detail'));
    expect(await leaveCompanyProgramme({ entryId: 'my-entry' })).toEqual({
      ok: false,
      error: 'error',
    });
  });
  it.each([null, {}, { entryId: '' }, { entryId: 'my-entry', userId: 'other' }])(
    'rejects malformed input',
    async input => {
      expect(await leaveCompanyProgramme(input)).toEqual({ ok: false, error: 'invalid_input' });
      expect(h.session).not.toHaveBeenCalled();
    }
  );
});

describe('pricing sponsor outlook action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    h.session.mockResolvedValue({ user: { id: 'me', role: 'member' } });
    h.authorize.mockResolvedValue(authority);
  });
  it.each([
    { covering: { source: 'sponsor', coverageEnd: new Date('2027-01-01') }, nextStart: null },
    { covering: null, nextStart: new Date('2027-01-01') },
    { covering: null, nextStart: null },
  ])('reads only the signed-in member’s outlook', async outlook => {
    h.outlook.mockResolvedValue(new Map([['me', outlook]]));
    expect(await getCompanyMembershipOutlook()).toEqual({ ok: true, outlook });
    expect(h.authorize).toHaveBeenCalledWith('me');
    expect(h.outlook).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-ks',
      ['me'],
      expect.any(Date)
    );
    expect(h.leave).not.toHaveBeenCalled();
  });
  it('fails closed without a session', async () => {
    h.session.mockResolvedValue(null);
    expect(await getCompanyMembershipOutlook()).toEqual({ ok: false });
    expect(h.outlook).not.toHaveBeenCalled();
  });
  it('fails closed on lookup failure', async () => {
    h.outlook.mockRejectedValue(new Error('private detail'));
    expect(await getCompanyMembershipOutlook()).toEqual({ ok: false });
  });
});
