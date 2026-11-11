import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

const mocks = vi.hoisted(() => ({ send: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification: mocks.send } }));
vi.mock('./delivery-targets', () => ({ removePreviewSubscriptions: mocks.remove }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }));
import { deliverPreviewPush } from './deliver-preview-push';

const recipient = { authority: {} as TenantAuthority, recipientId: 'recipient' };
const sub = { endpoint: 'https://push.example.test/own', p256dh: 'key', auth: 'auth' };
const payload = {
  title: 'Trusted title',
  body: 'Trusted generic body',
  url: '/dashboard/claims/claim',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:synthetic@example.test');
  mocks.send.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
describe('preview push leaf dispatch', () => {
  it('dispatches the already checked payload directly, then records bounded audit metadata', async () => {
    await deliverPreviewPush(recipient, [sub], payload);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
      { endpoint: sub.endpoint, keys: { p256dh: 'key', auth: 'auth' } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          publicKey: 'public',
          privateKey: 'private',
          subject: 'mailto:synthetic@example.test',
        },
      }
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: recipient.authority,
        entityId: 'recipient',
        metadata: {
          channel: 'messages',
          okCount: 1,
          failCount: 0,
          title: payload.title,
          url: payload.url,
        },
      })
    );
  });
  it('cleans only 404/410 endpoints and accounts for other provider failures', async () => {
    const subs = [
      sub,
      { ...sub, endpoint: `${sub.endpoint}/expired` },
      { ...sub, endpoint: `${sub.endpoint}/transient` },
    ];
    mocks.send
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 503 });
    await deliverPreviewPush(recipient, subs, payload);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
      recipient,
      subs,
      subs.slice(0, 2).map(item => item.endpoint)
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ okCount: 0, failCount: 3 }) })
    );
  });
  it('does not call the provider without VAPID or subscriptions', async () => {
    await deliverPreviewPush(recipient, [], payload);
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    await deliverPreviewPush(recipient, [sub], payload);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
