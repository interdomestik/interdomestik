import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as email from './email';
import { renderNewsletterEmail } from './email-templates';
import {
  stubDeploymentOrigin,
  STAGING_DOOR,
  PRODUCTION_DOOR,
} from './deployment-origin.test-support';

const provider = vi.hoisted(() => ({ send: vi.fn(), smtp: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider.send };
  },
}));
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: provider.smtp }) }));

beforeEach(() => {
  stubDeploymentOrigin();
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.send.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
  provider.smtp.mockReset().mockResolvedValue({ messageId: 'mail' });
});
afterEach(() => vi.unstubAllEnvs());

const cash = {
  leadName: 'Lead',
  status: 'needs_info',
  amount: 1234,
  currency: 'EUR',
  link: '/agent/leads',
};

describe('email door enforcement before provider delivery', () => {
  it('cash verification joins relative dashboard links to the runtime door', async () => {
    await email.sendPaymentVerificationEmail('agent@example.test', cash);
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(`href="${STAGING_DOOR}/agent/leads"`),
        text: expect.stringContaining(`${STAGING_DOOR}/agent/leads`),
      }),
      undefined
    );
  });

  it('cash verification refuses foreign absolute origins with zero provider calls', async () => {
    await expect(
      email.sendPaymentVerificationEmail('agent@example.test', {
        ...cash,
        link: 'https://evil.test/agent/leads',
      })
    ).rejects.toThrow();
    expect(provider.send).not.toHaveBeenCalled();
    expect(provider.smtp).not.toHaveBeenCalled();
  });

  it('newsletter CTAs are application destinations, including explicit country-host links', () => {
    // Campaign input exposes one hero CTA, no external editorial/partner-link contract.
    const path = '/sq/member?ref=ABC%2B1&token=a%2Fb#details';
    const template = renderNewsletterEmail({
      month: 'May',
      hero: {
        title: 'News',
        text: 'News',
        ctaUrl: `https://ks.interdomestik.com${path}`,
      },
    });
    expect(template.text).toContain(`${STAGING_DOOR}${path}`);
    expect(template.html).toContain(`${STAGING_DOOR}${path.replaceAll('&', '&amp;')}`);
    expect(() =>
      renderNewsletterEmail({
        month: 'May',
        hero: {
          title: 'News',
          text: 'News',
          ctaUrl: 'https://news.example.test/story',
        },
      })
    ).toThrow();
  });

  const claim = { id: 'claim-1', title: 'Claim', category: 'Vehicle' };
  const payment = {
    memberName: 'Member',
    planName: 'Family',
    daysRemaining: 7,
    gracePeriodDays: 14,
    gracePeriodEndDate: '2026-12-01',
  };
  const families: [string, () => Promise<unknown>][] = [
    [
      'password reset',
      () =>
        email.sendPasswordResetEmail(
          'a@example.test',
          `${STAGING_DOOR}/sq/reset-password?token=a%2Fb`
        ),
    ],
    ['sign-in OTP', () => email.sendSignInOtpEmail('a@example.test', '123456')],
    ['cash verification', () => email.sendPaymentVerificationEmail('a@example.test', cash)],
    ['claim submitted', () => email.sendClaimSubmittedEmail('a@example.test', claim)],
    ['claim assigned', () => email.sendClaimAssignedEmail('a@example.test', claim, 'Agent')],
    ['status change', () => email.sendStatusChangedEmail('a@example.test', claim, 'old', 'new')],
    ['new message', () => email.sendNewMessageEmail('a@example.test', claim, 'Sender', 'Message')],
    [
      'member welcome',
      () =>
        email.sendMemberWelcomeEmail('a@example.test', {
          memberName: 'Member',
          agentName: 'Agent',
        }),
    ],
    ['payment failed', () => email.sendPaymentFailedEmail('a@example.test', payment)],
    ['payment reminder', () => email.sendPaymentReminderEmail('a@example.test', payment)],
    ['final warning', () => email.sendPaymentFinalWarningEmail('a@example.test', payment)],
    ['welcome', () => email.sendWelcomeEmail('a@example.test', 'Member')],
    ['onboarding', () => email.sendOnboardingEmail('a@example.test', 'Member')],
    ['checkin', () => email.sendCheckinEmail('a@example.test', 'Member')],
    ['day 30', () => email.sendEngagementDay30Email('a@example.test', 'Member')],
    ['day 60', () => email.sendEngagementDay60Email('a@example.test', 'Member')],
    ['day 90', () => email.sendEngagementDay90Email('a@example.test', 'Member')],
    [
      'newsletter',
      () =>
        email.sendNewsletterEmail('a@example.test', {
          month: 'May',
          hero: { title: 'News', text: 'News' },
        }),
    ],
    [
      'seasonal',
      () => email.sendSeasonalEmail('a@example.test', { season: 'winter', name: 'Member' }),
    ],
    ['NPS', () => email.sendNpsSurveyEmail('a@example.test', { name: 'Member', token: 't_1' })],
  ];
  it.each(families)('%s sends its content on valid runtime config', async (family, send) => {
    await send();
    expect(provider.send).toHaveBeenCalledOnce();
    const expected = family === 'sign-in OTP' ? '123456' : `href="${STAGING_DOOR}/`;
    expect(provider.send.mock.calls[0][0].html).toContain(expected);
  });

  const invalidConfigurations = families
    .filter(([family]) => !['password reset', 'sign-in OTP'].includes(family))
    .flatMap(([family, send]) =>
      ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL'].flatMap(key =>
        ['resend', 'smtp'].map(transport => ({ family, send, key, transport }))
      )
    );
  it.each(invalidConfigurations)(
    '$family makes zero $transport provider calls on invalid production $key',
    async ({ send, key, transport }) => {
      stubDeploymentOrigin('production', PRODUCTION_DOOR);
      vi.stubEnv(key, 'https://www.interdomestik.com');
      vi.stubEnv('SMTP_HOST', transport === 'smtp' ? 'localhost' : '');
      await expect(send()).rejects.toThrow();
      expect(provider.send).not.toHaveBeenCalled();
      expect(provider.smtp).not.toHaveBeenCalled();
    }
  );

  it('pre-rendered dunning refuses invalid runtime config before provider initialization', async () => {
    const request = email.preparePastDueEmail('a@example.test', payment);
    stubDeploymentOrigin('production', PRODUCTION_DOOR);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.interdomestik.com');
    await expect(email.sendPreparedPastDueEmail(request, 'dedupe-1')).rejects.toThrow();
    expect(provider.send).not.toHaveBeenCalled();
    expect(provider.smtp).not.toHaveBeenCalled();
  });
});
