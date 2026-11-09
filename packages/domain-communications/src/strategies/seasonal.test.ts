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
it('rejects suppressed seasonal delivery before the campaign can record it as sent', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09'));
  h.send.mockResolvedValue({ success: false, suppressed: true, error: 'email_suppressed' });
  h.campaign.mockImplementation(({ sendToUser }) =>
    sendToUser({ email: 'member@other.invalid', name: 'Member' })
  );
  await expect(processSeasonalCampaigns({} as IngressCapability<'cron'>)).rejects.toThrow(
    'email_suppressed'
  );
});
