import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deliverPreviewPush } from './deliver-preview-push';
import {
  stubDeploymentOrigin,
  STAGING_DOOR,
  PRODUCTION_DOOR,
} from '../deployment-origin.test-support';

const send = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({ default: { sendNotification: send } }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('./delivery-targets', () => ({ removePreviewSubscriptions: vi.fn() }));
beforeEach(() => {
  stubDeploymentOrigin();
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  send.mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
const recipient = { authority: mintTestTenantAuthority('tenant_ks'), recipientId: 'member' };
const subscriptions = [
  { endpoint: 'https://push.example.test/subscription', p256dh: 'key', auth: 'auth' },
];
const payload = { title: 'Message', body: 'Message', url: '/sq/member/claims/C?ref=A%2B1' };

it('web preview push preserves relative destinations without deployment configuration', async () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
  await deliverPreviewPush(recipient, subscriptions, payload);
  expect(JSON.parse(send.mock.calls[0][1]).url).toBe(payload.url);
});
it('web preview push validates absolute destinations against the server door', async () => {
  await deliverPreviewPush(recipient, subscriptions, {
    ...payload,
    url: `${STAGING_DOOR}${payload.url}`,
  });
  expect(JSON.parse(send.mock.calls[0][1]).url).toBe(`${STAGING_DOOR}${payload.url}`);
});
it.each(['https://evil.test/path', '//evil.test/path', '/\\evil.test/path', 'javascript:alert(1)'])(
  'web preview push refuses unsafe link %s with zero provider calls',
  async url => {
    await expect(
      deliverPreviewPush(recipient, subscriptions, { ...payload, url })
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  }
);
it('web preview push refuses invalid production config with zero provider calls', async () => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('BETTER_AUTH_URL', 'https://www.interdomestik.com');
  await expect(
    deliverPreviewPush(recipient, subscriptions, {
      ...payload,
      url: `${PRODUCTION_DOOR}${payload.url}`,
    })
  ).rejects.toThrow('BETTER_AUTH_URL');
  expect(send).not.toHaveBeenCalled();
});
