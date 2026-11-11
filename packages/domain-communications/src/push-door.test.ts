import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendPushToUser } from './push';
import {
  stubDeploymentOrigin,
  STAGING_DOOR,
  PRODUCTION_DOOR,
} from './deployment-origin.test-support';

const mocks = vi.hoisted(() => ({ query: vi.fn(), send: vi.fn(), vapid: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.query,
}));
vi.mock('web-push', () => ({
  default: { sendNotification: mocks.send, setVapidDetails: mocks.vapid },
}));
beforeEach(() => {
  stubDeploymentOrigin();
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  mocks.query
    .mockReset()
    .mockResolvedValueOnce([{ pushMessages: true }])
    .mockResolvedValueOnce([
      { endpoint: 'https://push.example.test/subscription', p256dh: 'key', auth: 'auth' },
    ]);
  mocks.send.mockReset().mockResolvedValue({});
  mocks.vapid.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
const deps = { authority: mintTestTenantAuthority('tenant_ks') };
const payload = { title: 'Message', body: 'Message', url: '/sq/member/claims/C?ref=A%2B1' };

it('push notifications resolve their destination against the runtime door', async () => {
  await sendPushToUser('member', 'messages', payload, deps);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.send.mock.calls[0][1]).url).toBe(`${STAGING_DOOR}${payload.url}`);
});
it('push notifications refuse foreign links before any provider call', async () => {
  await expect(
    sendPushToUser('member', 'messages', { ...payload, url: 'https://evil.test/path' }, deps)
  ).rejects.toThrow();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.vapid).not.toHaveBeenCalled();
});
it('push notifications make zero provider calls on invalid production config', async () => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.interdomestik.com');
  await expect(sendPushToUser('member', 'messages', payload, deps)).rejects.toThrow();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.vapid).not.toHaveBeenCalled();
});
