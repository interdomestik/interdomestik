import { afterEach, expect, it, vi } from 'vitest';
import { sendEmailOutcome } from '@interdomestik/domain-communications/email';
import { delivery, harness } from './run.test-support';

const mocks = vi.hoisted(() => ({
  withAuthority: vi.fn(),
  prepare: vi.fn(),
  sendMail: vi.fn(),
  resendFetch: vi.fn(),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withAuthority,
}));
vi.mock('./prepare-notification-delivery', () => ({ prepareNotificationDelivery: mocks.prepare }));
// domain-communications owns the nodemailer dependency and its email transport imports nodemailer's
// ESM entry; the mock targets that exact module. If an upgrade moves the entry, the mock no longer
// binds and the sendMail assertion below fails.
vi.mock('../../../domain-communications/node_modules/nodemailer/dist/esm/nodemailer.js', () => ({
  createTransport: () => ({ sendMail: mocks.sendMail }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uses Resend twice with the same key after a definite SMTP refusal and a lost Resend acknowledgement', async () => {
  vi.stubEnv('SMTP_HOST', 'localhost');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubGlobal('fetch', mocks.resendFetch);
  mocks.sendMail.mockRejectedValueOnce({ code: 'ECONNREFUSED', command: 'CONN' });
  mocks.resendFetch
    .mockRejectedValueOnce(
      new Error('Connection reset after the request was sent', { cause: { code: 'ECONNRESET' } })
    )
    .mockResolvedValueOnce(Response.json({ id: 'receipt' }));

  const row = delivery();
  const h = harness(mocks.withAuthority, mocks.prepare, [row]);
  mocks.prepare.mockResolvedValue({
    channel: 'email',
    locale: 'mk',
    to: 'member@example.test',
    rendered: { subject: 'Test', text: 'Test', html: '<p>Test</p>' },
  });
  h.sendEmail.mockImplementation(sendEmailOutcome);
  expect(await h.kick()).toMatchObject({ queued: 2 });
  expect(row).toMatchObject({ state: 'queued', attempts: 2, transport: 'resend' });

  h.setClock(Date.parse(row.nextAttemptAt));
  expect(await h.kick()).toMatchObject({ sent: 1 });
  expect(mocks.sendMail).toHaveBeenCalledOnce();
  expect(mocks.resendFetch.mock.calls.map(([, init]) => init.headers['Idempotency-Key'])).toEqual([
    row.id,
    row.id,
  ]);
});
