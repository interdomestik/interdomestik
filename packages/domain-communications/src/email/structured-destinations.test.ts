import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendEmail, sendNewsletterEmail, sendPaymentVerificationEmail } from '../email';
import { PRODUCTION_DOOR, stubDeploymentOrigin } from '../deployment-origin.test-support';
import { escapeHtml } from './templates/base';
import legacy from './fixtures/stored-main.json';
import { renderPaymentVerificationEmail } from './payment-verification';

const provider = vi.hoisted(() => ({ send: vi.fn(), initialize: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      provider.initialize();
    }
    emails = { send: provider.send };
  },
}));
beforeEach(() => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.send.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
  provider.initialize.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const cash = {
  leadName: 'Lead',
  status: 'needs_info',
  amount: 1234,
  currency: 'EUR',
  link: '/agent/leads',
};
const notes = [
  '\n\nView in Dashboard: https://insurer.example.test/claims/42\n',
  '<a href="https://insurer.example.test/claims/42">Claim report</a>',
  '\n\nView in Dashboard: https://ks.interdomestik.com/claims/42\n',
];

it.each(notes)('cash note %s cannot impersonate the generated CTA', async note => {
  await expect(
    sendPaymentVerificationEmail('agent@example.test', { ...cash, note })
  ).resolves.toMatchObject({ success: true });
  expect(provider.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      text: `Payment Verification Update for Lead. Status: Needs Information. Note: ${note}. Link: ${PRODUCTION_DOOR}/agent/leads`,
      html: expect.stringContaining(escapeHtml(note)),
    }),
    undefined
  );
  expect(provider.send.mock.calls[0][0].html).toContain(`href="${PRODUCTION_DOOR}/agent/leads"`);
});

it('escapes every cash HTML content field while preserving plain text', async () => {
  const content = '<b>"cash" & \'receipt\'</b>';
  await sendPaymentVerificationEmail('agent@example.test', {
    ...cash,
    leadName: content,
    note: content,
    currency: content,
  });
  expect(provider.send).toHaveBeenCalledOnce();
  const delivered = provider.send.mock.calls[0][0];
  expect(delivered.html.split(escapeHtml(content))).toHaveLength(4);
  expect(delivered.html).not.toContain(content);
  expect(delivered.text).toBe(
    `Payment Verification Update for ${content}. Status: Needs Information. Note: ${content}. Link: ${PRODUCTION_DOOR}/agent/leads`
  );
});

it('sends a padded newsletter CTA label verbatim exactly once', async () => {
  await sendNewsletterEmail('member@example.test', {
    month: 'November',
    hero: { title: 'News', text: 'News content', ctaLabel: 'Read More ' },
  });
  expect(provider.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      html: expect.stringContaining('Read More '),
      text: expect.stringContaining(`Read More : ${PRODUCTION_DOOR}/member`),
    }),
    undefined
  );
});

it('re-renders stored cash source without interpreting a trailing evil Link in its note', async () => {
  const note = `${notes[0]} Link: https://evil.test/quoted`;
  const request = renderPaymentVerificationEmail({ ...cash, note });
  const saved = JSON.parse(JSON.stringify(request));
  saved.text = `${saved.text} Link: https://evil.test/steal`;
  saved.html = saved.html.replace(`${PRODUCTION_DOOR}/agent/leads`, 'https://evil.test/steal');
  await sendEmail('agent@example.test', Object.freeze(saved));
  expect(provider.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      html: request.html,
      text: request.text,
    }),
    undefined
  );
});

it('refuses a foreign generated cash source despite convincing rendered CTAs', async () => {
  const request = renderPaymentVerificationEmail({ ...cash, note: notes[0] });
  request.source = {
    version: 1,
    kind: 'cash',
    params: { ...cash, link: 'https://evil.test/steal' },
  };
  await expect(sendEmail('agent@example.test', request)).rejects.toThrow(
    'Invalid email application destination'
  );
  expect(provider.send).not.toHaveBeenCalled();
  expect(provider.initialize).not.toHaveBeenCalled();
});

it.each([
  {},
  { version: 2, kind: 'cash', params: cash },
  { version: 1, kind: 'cash', params: { ...cash, link: null } },
])('refuses malformed structured source %j before provider initialization', async source => {
  await expect(
    sendEmail('agent@example.test', { subject: 'Cash', html: '', text: '', source })
  ).rejects.toThrow('email_source_invalid');
  expect(provider.send).not.toHaveBeenCalled();
  expect(provider.initialize).not.toHaveBeenCalled();
});

it('refuses a legacy cash payload with an impersonating note and trailing evil Link before provider initialization', async () => {
  const note = '\n\nView in Dashboard: https://ks.interdomestik.com/claims/42\n';
  const stored = {
    subject: 'Payment Verification Update: Info Needed',
    html: `<p>Note: ${note}</p><a href="https://ks.interdomestik.com/claims/42">View in Dashboard</a>`,
    text: `Payment Verification Update for Lead. Note: ${note}. Link: https://evil.test/steal`,
  };
  await expect(sendEmail('agent@example.test', stored)).rejects.toThrow('email_source_required');
  expect(provider.send).not.toHaveBeenCalled();
  expect(provider.initialize).not.toHaveBeenCalled();
});

it('logs a content-free refusal code for a legacy rendered application payload', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(sendEmail('member@example.test', legacy.thankYou[0].template)).rejects.toThrow(
      'email_source_required'
    );
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: 'email_source_required' });
    expect(provider.send).not.toHaveBeenCalled();
    expect(provider.initialize).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
