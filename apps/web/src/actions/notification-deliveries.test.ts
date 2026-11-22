import { authorizedSession, MEMBER_A, STAFF_A } from '@/test/safe-action-harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listFailedNotificationDeliveries,
  redriveNotificationDelivery,
} from './notification-deliveries';
import { updatePreferredLocale } from './preferred-locale';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  audit: vi.fn(),
  list: vi.fn(),
  redrive: vi.fn(),
  saveLocale: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.audit }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (_authority: unknown, work: (tx: object) => unknown) => work({}),
}));
vi.mock('@interdomestik/domain-communications/notification-deliveries', () => ({
  listFailedNotificationDeliveries: mocks.list,
  redriveNotificationDelivery: mocks.redrive,
}));
vi.mock('@interdomestik/domain-communications/recipient-locale', () => ({
  recipientLocales: ['sq', 'en', 'sr', 'mk', 'de'],
  savePreferredLocale: mocks.saveLocale,
}));

describe('notification and preferred-locale actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.audit.mockResolvedValue({ ok: true });
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
    mocks.saveLocale.mockResolvedValue(true);
    await expect(
      updatePreferredLocale({ locale: 'mk', userId: STAFF_A.id })
    ).resolves.toMatchObject({ success: false });
    await expect(updatePreferredLocale({ locale: 'fr' })).resolves.toMatchObject({
      success: false,
    });
    expect(mocks.saveLocale).not.toHaveBeenCalled();
    await expect(updatePreferredLocale({ locale: 'mk' })).resolves.toEqual({
      success: true,
      data: { locale: 'mk' },
    });
    expect(mocks.saveLocale).toHaveBeenCalledExactlyOnceWith(admitted.authority, 'mk');
  });
});
