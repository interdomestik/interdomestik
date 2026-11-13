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

it('push notifications preserve relative destinations without deployment configuration', async () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
  await sendPushToUser('member', 'messages', payload, deps);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.send.mock.calls[0][1]).url).toBe(payload.url);
});
it('push notifications validate absolute destinations against the runtime door', async () => {
  await sendPushToUser(
    'member',
    'messages',
    { ...payload, url: `${STAGING_DOOR}${payload.url}` },
    deps
  );
  expect(JSON.parse(mocks.send.mock.calls[0][1]).url).toBe(`${STAGING_DOOR}${payload.url}`);
});
it.each(['https://evil.test/path', '//evil.test/path', '/\\evil.test/path', 'javascript:alert(1)'])(
  'push notifications refuse unsafe link %s before any provider call',
  async url => {
    await expect(sendPushToUser('member', 'messages', { ...payload, url }, deps)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.vapid).not.toHaveBeenCalled();
  }
);
it('push notifications make zero provider calls on invalid production config', async () => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.interdomestik.com');
  await expect(
    sendPushToUser(
      'member',
      'messages',
      { ...payload, url: `${PRODUCTION_DOOR}${payload.url}` },
      deps
    )
  ).rejects.toThrow('NEXT_PUBLIC_SITE_URL');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.vapid).not.toHaveBeenCalled();
});
