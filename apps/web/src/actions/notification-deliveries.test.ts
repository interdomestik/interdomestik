import { authorizedSession, MEMBER_A, STAFF_A } from '@/test/safe-action-harness';
import { savePreferredLocale } from '@interdomestik/domain-communications/recipient-locale';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listFailedNotificationDeliveries,
  redriveNotificationDelivery,
} from './notification-deliveries';
import { updatePreferredLocale } from './preferred-locale';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getSession: vi.fn(),
  audit: vi.fn(),
  list: vi.fn(),
  redrive: vi.fn(),
  transact: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: mocks.getSession }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.audit }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.transact,
}));
vi.mock('@interdomestik/domain-communications/notification-deliveries', () => ({
  listFailedNotificationDeliveries: mocks.list,
  redriveNotificationDelivery: mocks.redrive,
}));
vi.mock('@interdomestik/domain-communications/recipient-locale', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/domain-communications/recipient-locale')>();
  return { ...actual, savePreferredLocale: vi.fn(actual.savePreferredLocale) };
});

describe('notification and preferred-locale actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.audit.mockResolvedValue({ ok: true });
    mocks.transact.mockImplementation((_authority, work) => work({}));
  });

  it.each([MEMBER_A, STAFF_A])('denies both admin operations to $role', async user => {
    mocks.authorize.mockResolvedValue(authorizedSession(user));
    await expect(listFailedNotificationDeliveries({ limit: 5 })).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    await expect(redriveNotificationDelivery({ id: 'delivery' })).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.redrive).not.toHaveBeenCalled();
  });

  it('passes an admitted admin the page size and reports a lost redrive as a conflict', async () => {
    mocks.authorize.mockResolvedValue(authorizedSession({ ...STAFF_A, role: 'tenant_admin' }));
    mocks.list.mockResolvedValue({ items: [], cursor: null });
    mocks.redrive.mockResolvedValue(false);
    await expect(listFailedNotificationDeliveries({ limit: 50 })).resolves.toMatchObject({
      success: true,
    });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({}, { limit: 50 });
    await expect(redriveNotificationDelivery({ id: 'delivery' })).resolves.toMatchObject({
      success: false,
      code: 'conflict',
    });
  });

  it('rejects caller-provided identity and writes the permitted locale with self authority', async () => {
    const admitted = authorizedSession(MEMBER_A);
    mocks.authorize.mockResolvedValue(admitted);
    vi.mocked(savePreferredLocale).mockResolvedValue('saved');
    await expect(
      updatePreferredLocale({ locale: 'mk', userId: STAFF_A.id })
    ).resolves.toMatchObject({ success: false });
    await expect(updatePreferredLocale({ locale: 'fr' })).resolves.toMatchObject({
      success: false,
    });
    expect(savePreferredLocale).not.toHaveBeenCalled();
    await expect(updatePreferredLocale({ locale: 'mk' })).resolves.toEqual({
      success: true,
      data: { locale: 'mk' },
    });
    expect(savePreferredLocale).toHaveBeenCalledExactlyOnceWith(
      admitted.authority,
      admitted.session,
      'mk'
    );
  });

  it('reports unavailable profile scope to a cross-home admin without opening a transaction', async () => {
    const { authorizeSessionTenant } = await vi.importActual<
      typeof import('@/lib/tenant-authority.server')
    >('@/lib/tenant-authority.server');
    const { session } = authorizedSession({ ...STAFF_A, role: 'admin' });
    mocks.getSession.mockResolvedValue({
      ...session,
      user: { ...session.user, accessTenantId: 'tenant-b' },
    });
    mocks.authorize.mockImplementation(authorizeSessionTenant);
    mocks.transact.mockResolvedValue('conflict');

    await expect(updatePreferredLocale({ locale: 'mk' })).resolves.toMatchObject({
      success: false,
      code: 'profile_scope_unavailable',
    });
    expect(mocks.transact).not.toHaveBeenCalled();
  });

  it('refuses a session bound to a different authority principal', async () => {
    const { authorizeSessionTenant } = await vi.importActual<
      typeof import('@/lib/tenant-authority.server')
    >('@/lib/tenant-authority.server');
    const { session } = authorizedSession(MEMBER_A);
    mocks.getSession.mockResolvedValue(authorizedSession(STAFF_A).session);
    const admitted = await authorizeSessionTenant(new Headers());
    mocks.authorize.mockResolvedValue({ ...admitted, session });
    mocks.transact.mockResolvedValue('conflict');

    await expect(updatePreferredLocale({ locale: 'mk' })).resolves.toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(mocks.transact).not.toHaveBeenCalled();
  });
});
