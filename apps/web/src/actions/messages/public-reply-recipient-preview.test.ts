import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  deliver: vi.fn(),
  role: vi.fn(),
  subscriptions: vi.fn(),
  jobs: [] as (() => Promise<void>)[],
}));
vi.mock('next/server', () => ({
  after: (job: () => Promise<void>) => {
    mocks.jobs.push(job);
  },
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/notifications/recipient-role', () => ({ getNotificationRecipientRole: mocks.role }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => `trusted:${key}`),
}));
vi.mock('@interdomestik/domain-communications/messages/send', () => ({
  preparePublicReplyNotification: mocks.prepare,
  deliverPublicReplyNotification: mocks.deliver,
  loadPublicReplyPushSubscriptions: mocks.subscriptions,
  removeExpiredPublicReplySubscriptions: vi.fn(() => Promise.resolve()),
  describePublicReplyFailure: () => ({ name: 'Error' }),
}));
import { notifyPublicReplyCore } from './public-reply-notification.core';
const authority = {} as TenantAuthority;
const params = {
  authority,
  session: { user: { id: 'staff', role: 'staff' } } as NonNullable<Session>,
  claimId: 'claim',
  messageId: 'message',
  expectedRecipientId: 'recipient',
};
const plan = {
  authority,
  tenantId: 'tenant',
  recipientId: 'recipient',
  notificationId: 'notification',
  claim: { id: 'claim', title: 'TITLE-SENTINEL' },
  senderName: 'SENDER-SENTINEL',
  messageContent: 'MESSAGE-SENTINEL',
  verifiedEmail: 'synthetic@example.test',
  pushSubscriptions: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobs = [];
  mocks.role.mockResolvedValue('member');
  mocks.prepare.mockResolvedValue({ status: 'created', plan });
  mocks.subscriptions.mockResolvedValue([{ endpoint: 'synthetic-endpoint' }]);
  mocks.deliver.mockResolvedValue(undefined);
});
describe('public reply email/push recipient preview policy', () => {
  it('checks BM before preparation and attaches generic email and push delivery content', async () => {
    mocks.role.mockResolvedValue('branch_manager');
    await notifyPublicReplyCore(params);
    expect(mocks.role.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepare.mock.invocationCallOrder[0]
    );
    await mocks.jobs[0]();
    const delivered = mocks.deliver.mock.calls[0][0];
    expect(delivered.messageContent).toBe('trusted:newMessage.content');
    expect(delivered.claim).toEqual({ id: 'claim', title: 'trusted:newMessage.title' });
    expect(JSON.stringify(delivered)).not.toContain('SENTINEL');
    expect(delivered.pushSubscriptions).toHaveLength(1);
    expect(plan.messageContent).toBe('MESSAGE-SENTINEL');
  });
  it.each([
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('keeps %s recipient previews unchanged', async role => {
    mocks.role.mockResolvedValue(role);
    await notifyPublicReplyCore(params);
    await mocks.jobs[0]();
    expect(mocks.deliver.mock.calls[0][0]).toMatchObject({
      claim: plan.claim,
      senderName: plan.senderName,
      messageContent: plan.messageContent,
    });
  });
  it('rechecks a recipient promoted to BM during deferral', async () => {
    mocks.role.mockResolvedValueOnce('member').mockResolvedValueOnce('branch_manager');
    await notifyPublicReplyCore(params);
    await mocks.jobs[0]();
    expect(JSON.stringify(mocks.deliver.mock.calls[0][0])).not.toContain('SENTINEL');
    expect(mocks.role).toHaveBeenCalledTimes(2);
  });
  it('fails closed on missing or failed recipient lookup before preparation or deferred delivery', async () => {
    mocks.role.mockResolvedValueOnce(null);
    await notifyPublicReplyCore(params);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.jobs).toEqual([]);
    mocks.role.mockResolvedValueOnce('member').mockRejectedValueOnce(new Error('private'));
    await notifyPublicReplyCore(params);
    await mocks.jobs[0]();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
