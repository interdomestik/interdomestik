import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparePastDueEmail, sendEmail, sendPreparedPastDueEmail } from './email';
import {
  PRODUCTION_DOOR,
  STAGING_DOOR,
  stubDeploymentOrigin,
} from './deployment-origin.test-support';
import baseline from './email/fixtures/stored-main.json';
import type { EmailTemplate } from './email-templates';

const provider = vi.hoisted(() => ({ send: vi.fn(), smtp: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider.send };
  },
}));
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: provider.smtp }) }));

beforeEach(() => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.send.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
  provider.smtp.mockReset().mockResolvedValue({ messageId: 'mail' });
});
afterEach(() => vi.unstubAllEnvs());

function expectPayload(template: EmailTemplate, oldOrigin: string, idempotencyKey: string): void {
  expect(provider.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      subject: template.subject,
      html: template.html.replaceAll(oldOrigin, PRODUCTION_DOOR),
      text: template.text.replaceAll(oldOrigin, PRODUCTION_DOOR),
    }),
    { idempotencyKey }
  );
}

describe('stored destinations are checked against the door at delivery time', () => {
  // These complete payloads were rendered by origin/main, including its retained www default.
  it('rebases the origin/main www dunning payload when replayed under the canonical door', async () => {
    await sendPreparedPastDueEmail(Object.freeze(baseline.dunning), 'dunning-replay');
    expectPayload(baseline.dunning, 'https://www.interdomestik.com', 'dunning-replay');
    expect(baseline.dunning.text).toContain('https://www.interdomestik.com/member/membership');
  });

  it.each(baseline.thankYou)(
    'rebases the stored $locale thank-you HTML and text without changing copy or tokens',
    async ({ template }) => {
      await sendEmail('member@example.test', Object.freeze(template), {
        idempotencyKey: 'confirmation-replay',
      });
      expectPayload(template, 'https://ks.interdomestik.com', 'confirmation-replay');
    }
  );

  it('uses current configuration when a staged dunning request is delivered after cutover', async () => {
    stubDeploymentOrigin();
    const request = preparePastDueEmail('member@example.test', {
      memberName: 'Member',
      planName: 'Family',
      gracePeriodDays: 14,
      gracePeriodEndDate: '2026-12-01',
    });
    stubDeploymentOrigin('production', PRODUCTION_DOOR);
    await sendPreparedPastDueEmail(request, 'staging-replay');
    expectPayload(request, STAGING_DOOR, 'staging-replay');
  });

  const deliveries = [
    [
      'dunning',
      (template: EmailTemplate) =>
        sendPreparedPastDueEmail({ ...baseline.dunning, ...template }, 'stored-key'),
    ],
    [
      'thank-you',
      (template: EmailTemplate) =>
        sendEmail('member@example.test', template, { idempotencyKey: 'stored-key' }),
    ],
  ] as const;
  const rejected = deliveries.flatMap(([family, send]) =>
    ['html', 'text'].flatMap(part =>
      ['resend', 'smtp'].map(transport => ({ family, send, part, transport }))
    )
  );
  it.each(rejected)(
    '$family refuses a foreign origin in stored $part with zero $transport provider calls',
    async ({ send, part, transport }) => {
      vi.stubEnv('SMTP_HOST', transport === 'smtp' ? 'localhost' : '');
      const template = { ...baseline.thankYou[0].template };
      if (part === 'html')
        template.html = template.html.replaceAll(
          'https://ks.interdomestik.com',
          'https://evil.test'
        );
      else
        template.text = template.text.replaceAll(
          'https://ks.interdomestik.com',
          'https://evil.test'
        );
      await expect(send(template)).rejects.toThrow();
      expect(provider.send).not.toHaveBeenCalled();
      expect(provider.smtp).not.toHaveBeenCalled();
    }
  );

  it('rebases stored destinations on the SMTP delivery path too', async () => {
    vi.stubEnv('SMTP_HOST', 'localhost');
    const template = baseline.thankYou[0].template;
    await sendEmail('member@example.test', template);
    expect(provider.smtp).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        html: template.html.replaceAll('https://ks.interdomestik.com', PRODUCTION_DOOR),
        text: template.text.replaceAll('https://ks.interdomestik.com', PRODUCTION_DOOR),
      })
    );
  });
});
