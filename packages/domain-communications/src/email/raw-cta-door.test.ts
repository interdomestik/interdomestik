import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendEmail } from '../email';
import { renderSponsorMail } from '../sponsor-mail';
import type { SponsorMailInput } from '../sponsor-mail';
import { renderThankYouLetterEmail, type ThankYouLetterParams } from './thank-you-letter';
import {
  stubDeploymentOrigin,
  STAGING_DOOR,
  PRODUCTION_DOOR,
} from '../deployment-origin.test-support';

const provider = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider };
  },
}));
beforeEach(() => {
  stubDeploymentOrigin();
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

const sponsor = {
  locale: 'en',
  firstName: 'Member',
  supportEmail: 'support@example.test',
  kind: 'membership_end_offer',
  offerUrl: '/en/pricing?token=a%2Fb',
} satisfies SponsorMailInput;
const thanks: ThankYouLetterParams = {
  locale: 'en',
  memberName: 'Member',
  memberNumber: 'MEM-1',
  planName: 'Family',
  planPrice: '20',
  planInterval: 'year',
  memberSince: '2026-01-01',
  expiresAt: '2027-01-01',
  providerReference: 'sub_1',
  dashboardUrl: '/en/member/membership?ref=A%2B1',
};
const families = [
  ['sponsor', (link: string) => renderSponsorMail({ ...sponsor, offerUrl: link })],
  ['thank-you', (link: string) => renderThankYouLetterEmail({ ...thanks, dashboardUrl: link })],
] as const;

it.each(families)(
  '%s joins relative links and refuses foreign origins before any provider call',
  async (_family, render) => {
    const path = '/de/member?token=a%2Fb&ref=A%2B1#details';
    const template = render(path);
    expect(template.text).toContain(`${STAGING_DOOR}${path}`);
    expect(template.html).toContain(`${STAGING_DOOR}${path.replace('&', '&amp;')}`);
    await expect(async () =>
      sendEmail('member@example.test', render(`https://evil.test${path}`))
    ).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  }
);

it.each(families)(
  '%s makes zero provider calls on invalid production config',
  async (_family, render) => {
    stubDeploymentOrigin('production', PRODUCTION_DOOR);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.interdomestik.com');
    await expect(async () =>
      sendEmail('member@example.test', render(`${PRODUCTION_DOOR}/en/member`))
    ).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  }
);
