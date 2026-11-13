import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparePastDueEmail, sendEmail, sendPreparedPastDueEmail } from './email';
import {
  PRODUCTION_DOOR,
  STAGING_DOOR,
  stubDeploymentOrigin,
} from './deployment-origin.test-support';
import baseline from './email/fixtures/stored-main.json';
import { renderThankYouLetterEmail } from './email/thank-you-letter';
import type { EmailTemplate } from './email-templates';

const provider = vi.hoisted(() => ({ send: vi.fn(), smtp: vi.fn(), initialize: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      provider.initialize();
    }
    emails = { send: provider.send };
  },
}));
vi.mock('nodemailer', () => ({
  createTransport: () => {
    provider.initialize();
    return { sendMail: provider.smtp };
  },
}));

beforeEach(() => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.send.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
  provider.smtp.mockReset().mockResolvedValue({ messageId: 'mail' });
  provider.initialize.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

function thankYou(locale: 'en' | 'sq' | 'mk' | 'sr' | 'de' = 'en'): EmailTemplate {
  return renderThankYouLetterEmail({
    locale,
    memberName: 'Member',
    memberNumber: 'MEM-1',
    planName: 'Family',
    planPrice: '20',
    planInterval: 'year',
    memberSince: '2026-01-01',
    expiresAt: '2027-01-01',
    providerReference: 'sub_1',
    dashboardUrl: `/${locale}/member/membership?token=A%2B1#details`,
  });
}
function expectPayload(template: EmailTemplate, idempotencyKey: string): void {
  expect(provider.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      subject: template.subject,
      html: template.html.replaceAll(STAGING_DOOR, PRODUCTION_DOOR),
      text: template.text.replaceAll(STAGING_DOOR, PRODUCTION_DOOR),
    }),
    { idempotencyKey }
  );
}
const sends = [
  [
    'dunning',
    (template: EmailTemplate) =>
      sendPreparedPastDueEmail(
        {
          from: 'support@example.test',
          to: 'member@example.test',
          ...template,
        },
        'stored-key'
      ),
  ],
  [
    'thank-you',
    (template: EmailTemplate) =>
      sendEmail('member@example.test', template, {
        idempotencyKey: 'stored-key',
      }),
  ],
] as const;

describe('stored destinations are checked as source data at delivery time', () => {
  it('refuses origin/main rendered-only dunning instead of guessing its CTA', async () => {
    await expect(
      sendPreparedPastDueEmail(Object.freeze(baseline.dunning), 'dunning-replay')
    ).rejects.toThrow('email_source_required');
    expect(provider.send).not.toHaveBeenCalled();
    expect(provider.initialize).not.toHaveBeenCalled();
  });
  it.each(baseline.thankYou)(
    'refuses origin/main rendered-only $locale thank-you',
    async ({ template }) => {
      await expect(
        sendEmail('member@example.test', Object.freeze(template), {
          idempotencyKey: 'confirmation-replay',
        })
      ).rejects.toThrow('email_source_required');
      expect(provider.send).not.toHaveBeenCalled();
      expect(provider.initialize).not.toHaveBeenCalled();
    }
  );
  it('rebases a serialized staged dunning source after cutover without changing the stored request', async () => {
    stubDeploymentOrigin();
    const request = preparePastDueEmail('member@example.test', {
      memberName: 'Member',
      planName: 'Family',
      gracePeriodDays: 14,
      gracePeriodEndDate: '2026-12-01',
    });
    const saved = JSON.stringify(request);
    stubDeploymentOrigin('production', PRODUCTION_DOOR);
    await sendPreparedPastDueEmail(Object.freeze(JSON.parse(saved)), 'staging-replay');
    expectPayload(request, 'staging-replay');
    expect(JSON.stringify(request)).toBe(saved);
  });
  it.each(['sq', 'en', 'sr', 'mk', 'de'] as const)(
    'rebases serialized %s thank-you source and preserves copy and tokens',
    async locale => {
      stubDeploymentOrigin();
      const request = thankYou(locale);
      stubDeploymentOrigin('production', PRODUCTION_DOOR);
      await sendEmail('member@example.test', Object.freeze(JSON.parse(JSON.stringify(request))), {
        idempotencyKey: 'confirmation-replay',
      });
      expectPayload(request, 'confirmation-replay');
    }
  );
  const rejected = sends.flatMap(([family, send]) =>
    ['resend', 'smtp'].flatMap(transport =>
      [
        'https://evil.test/steal',
        'https://ida.interdomestik.com.evil.test/path',
        'https://user@ida.interdomestik.com/path',
        'https://ida.interdomestik.com:444/path',
        'http://ida.interdomestik.com/path',
      ].map(destination => ({ family, send, transport, destination }))
    )
  );
  it.each(rejected)(
    '$family refuses structured $destination with zero $transport calls',
    async ({ send, transport, destination }) => {
      vi.stubEnv('SMTP_HOST', transport === 'smtp' ? 'localhost' : '');
      const request = thankYou();
      const source = {
        version: 1,
        kind: 'thank-you',
        params: {
          ...(request.source as { params: object }).params,
          dashboardUrl: destination,
        },
      };
      await expect(send({ ...request, source })).rejects.toThrow(
        'Invalid email application destination'
      );
      expect(provider.send).not.toHaveBeenCalled();
      expect(provider.smtp).not.toHaveBeenCalled();
      expect(provider.initialize).not.toHaveBeenCalled();
    }
  );
  it('rebases structured destinations on SMTP delivery too', async () => {
    stubDeploymentOrigin();
    const request = thankYou();
    stubDeploymentOrigin('production', PRODUCTION_DOOR);
    vi.stubEnv('SMTP_HOST', 'localhost');
    await sendEmail('member@example.test', request);
    expect(provider.smtp).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        html: request.html.replaceAll(STAGING_DOOR, PRODUCTION_DOOR),
        text: request.text.replaceAll(STAGING_DOOR, PRODUCTION_DOOR),
      })
    );
  });
});
