import type { IngressCapability } from '@interdomestik/database/ingress';
import { afterEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ send: vi.fn(), notify: vi.fn(), campaign: vi.fn() }));
vi.mock('../email', () => ({ sendSeasonalEmail: h.send }));
vi.mock('../notifications/notify', () => ({ sendNotification: h.notify }));
vi.mock('../campaign-execution', () => ({
  processBatchedUserCampaign: h.campaign,
  withRetries: (send: () => Promise<unknown>) => send(),
}));
import { processSeasonalCampaigns } from './seasonal';

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
it('keeps the in-app notification and returns a skipped email outcome', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09'));
  h.send.mockResolvedValue({ success: false, suppressed: true, error: 'email_suppressed' });
  h.campaign.mockImplementation(({ sendToUser }) =>
    sendToUser({
      id: 'u1',
      tenantId: 'tenant-a',
      email: 'member@other.invalid',
      name: 'Member',
    }).then((outcome: unknown) => {
      expect(outcome).toBe('skipped');
      return {};
    })
  );
  await expect(processSeasonalCampaigns({} as IngressCapability<'cron'>)).resolves.toMatchObject({
    processed: true,
  });
  expect(h.notify).toHaveBeenCalledTimes(1);
});
