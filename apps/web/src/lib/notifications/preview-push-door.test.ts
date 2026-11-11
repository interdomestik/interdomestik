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

it('web preview push resolves its relative destination against the server door', async () => {
  await deliverPreviewPush(recipient, subscriptions, payload);
  expect(JSON.parse(send.mock.calls[0][1]).url).toBe(`${STAGING_DOOR}${payload.url}`);
});
it('web preview push refuses foreign links with zero provider calls', async () => {
  await expect(
    deliverPreviewPush(recipient, subscriptions, { ...payload, url: 'https://evil.test/path' })
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
it('web preview push refuses invalid production config with zero provider calls', async () => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('BETTER_AUTH_URL', 'https://www.interdomestik.com');
  await expect(deliverPreviewPush(recipient, subscriptions, payload)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
