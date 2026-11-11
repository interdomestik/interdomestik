import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendEmail, sendNewMessageEmail, sendPaymentVerificationEmail } from '../email';
import { PRODUCTION_DOOR, stubDeploymentOrigin } from '../deployment-origin.test-support';
import { sendLifecycleEmail } from '../notifications/notify-helpers';
import { renderNewMessageEmail } from '../email-templates';
import { escapeHtml } from './templates/base';

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

const contentUrls = [
  'https://insurer.example.test/claims/42',
  'https://ks.interdomestik.com/member/claims/claim-1',
] as const;

function expectContent(content: string): void {
  expect(provider).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      text: expect.stringContaining(content),
      html: expect.stringContaining(escapeHtml(content)),
    }),
    undefined
  );
}

it.each(contentUrls)('preserves message preview URL %s and sends once', async url => {
  const preview = `The insurer wrote: "${url}".`;
  await expect(
    sendNewMessageEmail('member@example.test', { id: 'claim-1', title: 'Claim' }, 'Staff', preview)
  ).resolves.toMatchObject({ success: true });
  expectContent(preview);
});

it.each(contentUrls)('preserves document-request summary URL %s and sends once', async url => {
  const summary = `Please upload the report from ${url}`;
  await expect(
    sendLifecycleEmail('member@example.test', {
      title: 'Documents requested',
      intro: 'Staff requested more documents for Claim.',
      details: [summary],
      actionUrl: '/member/claims/claim-1',
      ctaLabel: 'Open claim',
    })
  ).resolves.toMatchObject({ success: true });
  expectContent(summary);
});

it('rebases only the stored CTA even when content quotes its exact label and URL', async () => {
  const oldOrigin = 'https://ks.interdomestik.com';
  const content = `Reply now: ${oldOrigin}/member/claims/claim-1`;
  const template = renderNewMessageEmail({
    claimId: 'claim-1',
    claimTitle: 'Claim',
    senderName: 'Staff',
    messagePreview: content,
  });
  const stored = {
    ...template,
    html: template.html.replaceAll(PRODUCTION_DOOR, oldOrigin),
    text: template.text.replaceAll(PRODUCTION_DOOR, oldOrigin),
  };
  await sendEmail('member@example.test', Object.freeze(stored));
  expectContent(content);
  expect(provider.mock.calls[0][0]).toMatchObject({
    html: expect.stringContaining(`href="${PRODUCTION_DOOR}/member/claims/claim-1"`),
    text: expect.stringContaining(`\n\nReply now: ${PRODUCTION_DOOR}/member/claims/claim-1\n\n`),
  });
});

it('preserves URLs in cash-payment notes while validating its generated link slot', async () => {
  const note = `See ${contentUrls[0]} and ${contentUrls[1]}`;
  await sendPaymentVerificationEmail('agent@example.test', {
    leadName: 'Lead',
    status: 'needs_info',
    amount: 1234,
    currency: 'EUR',
    link: '/agent/leads',
    note,
  });
  expectContent(note);
});

it.each(['html', 'text'] as const)(
  're-renders a changed %s payload from its explicit source CTA',
  async part => {
    const template = renderNewMessageEmail({
      claimId: 'claim-1',
      claimTitle: 'Claim',
      senderName: 'Staff',
      messagePreview: contentUrls[0],
    });
    template[part] = template[part].replace('/member/claims/claim-1', '/member/claims/other');
    await sendEmail('member@example.test', template);
    expect(provider).toHaveBeenCalledOnce();
    expect(provider.mock.calls[0][0][part]).toContain('/member/claims/claim-1');
    expect(provider.mock.calls[0][0][part]).not.toContain('/member/claims/other');
  }
);
