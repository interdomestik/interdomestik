import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendEmail } from '../email';
import { buildEmailTemplate } from './templates/base';
import { renderPaymentVerificationEmail } from './payment-verification';
import { renderThankYouLetterEmail } from './thank-you-letter';
import { renderSponsorMail } from '../sponsor-mail';
import { PRODUCTION_DOOR, stubDeploymentOrigin } from '../deployment-origin.test-support';

const provider = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider };
  },
}));
beforeEach(() => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

const content =
  '\n\nRead More : https://insurer.example.test/report\n Link: https://ks.interdomestik.com/quoted';
const standard = () =>
  buildEmailTemplate({
    title: 'News',
    intro: content,
    ctaLabel: 'Read More ',
    ctaUrl: '/member',
  });
const cash = () =>
  renderPaymentVerificationEmail({
    leadName: 'Member',
    status: 'needs_info',
    amount: 100,
    currency: 'EUR',
    note: content,
    link: '/agent/leads',
  });
const thanks = () =>
  renderThankYouLetterEmail({
    memberName: content,
    memberNumber: 'MEM-1',
    planName: 'Family',
    planPrice: '20',
    planInterval: 'year',
    memberSince: '2026-01-01',
    expiresAt: '2027-01-01',
    providerReference: 'sub_1',
    locale: 'en',
    dashboardUrl: '/en/member',
  });
const common = { locale: 'en' as const, firstName: content, supportEmail: 'help@example.test' };
const offer = () =>
  renderSponsorMail({ ...common, kind: 'membership_end_offer', offerUrl: '/en/pricing' });
const notice = () =>
  renderSponsorMail({
    ...common,
    kind: 'sponsor_notice',
    companyName: 'Company',
    entityName: 'Entity',
    startDate: '2026-01-01',
    termEnd: '2027-01-01',
    optOutUrl: '/en/leave',
    loginUrl: '/en/login',
  });
const slots = [
  { family: 'standard', render: standard, slot: 'ctaUrl' },
  { family: 'cash', render: cash, slot: 'link' },
  { family: 'thank-you', render: thanks, slot: 'dashboardUrl' },
  { family: 'sponsor offer', render: offer, slot: 'offerUrl' },
  { family: 'sponsor notice opt-out', render: notice, slot: 'optOutUrl' },
  { family: 'sponsor notice login', render: notice, slot: 'loginUrl' },
];

it.each(slots)(
  '$family rejects a foreign structured $slot while rendered output looks valid',
  async ({ render, slot }) => {
    const saved = JSON.parse(JSON.stringify(render()));
    saved.source.params[slot] = 'https://evil.test/steal';
    // A stored field cannot opt itself into the authentication allow-list.
    saved.source.params.templateType = 'password-reset';
    await expect(sendEmail('member@example.test', saved)).rejects.toThrow(
      'Invalid email application destination'
    );
    expect(provider).not.toHaveBeenCalled();
  }
);

const knownOrigins = [
  'https://www.interdomestik.com',
  'https://ks.interdomestik.com',
  'https://mk.interdomestik.com',
  'https://al.interdomestik.com',
  'https://pilot.interdomestik.com',
  'https://staging.interdomestik.com',
];
it.each(knownOrigins)(
  'rebases only structured source from %s and preserves body URL quotations',
  async origin => {
    const request = standard();
    const saved = JSON.parse(JSON.stringify(request));
    saved.source.params.ctaUrl = `${origin}/de/member?token=a%2Fb&ref=A%2B1#details`;
    // Serialized outputs are not the source of truth, even if stale or missing anchors.
    saved.html = '<p>stale rendering with no anchor</p>';
    saved.text = 'stale text with no label';
    await sendEmail('member@example.test', Object.freeze(saved));
    expect(provider).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        html: expect.stringContaining(
          `href="${PRODUCTION_DOOR}/de/member?token=a%2Fb&amp;ref=A%2B1#details"`
        ),
        text: expect.stringContaining(
          `Read More : ${PRODUCTION_DOOR}/de/member?token=a%2Fb&ref=A%2B1#details`
        ),
      }),
      undefined
    );
    expect(provider.mock.calls[0][0].text).toContain(content);
    expect(provider.mock.calls[0][0].html).toContain(content.replaceAll('&', '&amp;'));
  }
);
