import { stubDeploymentOrigin } from './deployment-origin.test-support';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { e2eEmail } from '../../database/src/e2e-users';

const transport = vi.hoisted(() => ({
  smtp: vi.fn(),
  resend: vi.fn(),
  sendMail: vi.fn(),
  resendSend: vi.fn(),
}));
vi.mock('nodemailer', () => ({ createTransport: transport.smtp }));
vi.mock('resend', () => ({
  Resend: function MockResend() {
    transport.resend();
    return { emails: { send: transport.resendSend } };
  },
}));

beforeEach(() => {
  stubDeploymentOrigin();
  vi.resetModules();
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  transport.smtp.mockReturnValue({ sendMail: transport.sendMail });
  transport.sendMail.mockResolvedValue({ messageId: 'catcher-id' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it.each(['', 'external.example.test', '127.0.0.1'])(
  'suppresses reserved recipients before external provider initialization (SMTP=%s)',
  async smtpHost => {
    vi.stubEnv('SMTP_HOST', smtpHost);
    const { sendEmail } = await import('./email');
    await Promise.all(
      [
        e2eEmail('staff.ks'),
        'person@invalid',
        'member@other.invalid',
        'Staff <STAFF@SYNTHETIC.INVALID>',
      ].map(async to => {
        await expect(sendEmail(to, { subject: 'fixture', html: '', text: '' })).resolves.toEqual({
          success: false,
          suppressed: true,
          error: 'email_suppressed',
        });
      })
    );
    expect(transport.smtp).not.toHaveBeenCalled();
    expect(transport.resend).not.toHaveBeenCalled();
  }
);

it('delivers a reserved-domain OTP through the opted-in automated loopback catcher', async () => {
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '1');
  vi.stubEnv('E2E_SMTP_HOST', '127.0.0.1');
  vi.stubEnv('E2E_SMTP_PORT', '1025');
  vi.stubEnv('SMTP_HOST', 'external.example.test');
  const { sendSignInOtpEmail } = await import('./email');
  const to = e2eEmail('member.ks.a1');
  await expect(sendSignInOtpEmail(to, '654321', 'en')).resolves.toEqual({
    success: true,
    id: 'catcher-id',
  });
  expect(transport.smtp).toHaveBeenCalledWith(
    expect.objectContaining({ host: '127.0.0.1', port: 1025 })
  );
  expect(transport.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({ to, text: expect.stringContaining('654321') })
  );
  expect(transport.resend).not.toHaveBeenCalled();
});

it('suppresses invalid mail without the catcher opt-in even in automation', async () => {
  vi.stubEnv('PLAYWRIGHT', '1');
  const { sendEmail } = await import('./email');
  await expect(
    sendEmail('member@other.invalid', { subject: 'fixture', html: '', text: '' })
  ).resolves.toEqual({
    success: false,
    suppressed: true,
    error: 'email_suppressed',
  });
  expect(transport.smtp).not.toHaveBeenCalled();
  expect(transport.resend).not.toHaveBeenCalled();
});

it('never falls back from loopback SMTP to external Resend for a reserved recipient', async () => {
  vi.stubEnv('SMTP_HOST', '127.0.0.1');
  transport.sendMail.mockRejectedValueOnce(new Error('fixture SMTP failure'));
  const { sendEmail } = await import('./email');
  await expect(
    sendEmail('member@other.invalid', { subject: 'fixture', html: '', text: '' })
  ).resolves.toEqual({
    success: false,
    suppressed: true,
    error: 'email_suppressed',
  });
  expect(transport.sendMail).not.toHaveBeenCalled();
  expect(transport.resendSend).not.toHaveBeenCalled();
});

it('guards direct Resend delivery too, including dunning callers', async () => {
  const { sendViaResend, createEmailTelemetry } = await import('./sign-in-otp-email');
  const client = { emails: { send: transport.resendSend } } as unknown as Parameters<
    typeof sendViaResend
  >[0];
  await expect(
    sendViaResend(
      client,
      'from@example.com',
      'member@billing.invalid',
      { subject: 'fixture', html: '', text: '' },
      {},
      createEmailTelemetry()
    )
  ).resolves.toEqual({
    success: false,
    suppressed: true,
    error: 'email_suppressed',
  });
  expect(transport.resendSend).not.toHaveBeenCalled();
});

it('matches the reserved TLD rather than one dataset domain or a longer non-reserved suffix', async () => {
  const { isNonSendingEmail } = await import('./non-sending-email');
  expect(isNonSendingEmail('support@interdomestik.com')).toBe(false);
  expect(isNonSendingEmail('member@other.invalid.attacker.test')).toBe(false);
  expect(isNonSendingEmail('member@example.com')).toBe(false);
  expect(isNonSendingEmail('member@OTHER.INVALID.')).toBe(true);
});

it('installed Zod validators used by Better Auth and Paddle accept the reserved TLD', () => {
  expect(z.email().safeParse(e2eEmail('member.ks.a1')).success).toBe(true);
  expect(z.string().email().safeParse(e2eEmail('member.ks.a1')).success).toBe(true);
});

it.each([
  'real@example.com, member@other.invalid',
  '"support@other.invalid team" <real@example.com>',
  ['real@example.com', 'member@other.invalid'],
])('preserves actual real mailboxes in mixed recipients: %s', async to => {
  vi.stubEnv('SMTP_HOST', '');
  transport.resendSend.mockResolvedValue({ data: { id: 'real-id' } });
  const { sendEmail } = await import('./email');
  await expect(sendEmail(to, { subject: 'fixture', html: '', text: '' })).resolves.toEqual({
    success: true,
    id: 'real-id',
  });
  expect(transport.resendSend).toHaveBeenCalledWith(
    expect.objectContaining({ to: 'real@example.com' }),
    undefined
  );
});

it('does not treat plain loopback SMTP or rejected catcher settings as an opt-in', async () => {
  vi.stubEnv('PLAYWRIGHT', '1');
  vi.stubEnv('E2E_SMTP_HOST', 'external.example.test');
  const { sendSignInOtpEmail } = await import('./email');
  await expect(sendSignInOtpEmail('member@other.invalid', '123456', 'en')).resolves.toMatchObject({
    success: false,
    suppressed: true,
  });
  expect(transport.smtp).not.toHaveBeenCalled();
});

it('suppresses prepared dunning before provider initialization and automated mock receipts', async () => {
  vi.stubEnv('PLAYWRIGHT', '1');
  const { sendPreparedPastDueEmail } = await import('./dunning-email');
  await expect(
    sendPreparedPastDueEmail(
      {
        from: 'sender@example.com',
        to: 'member@other.invalid',
        subject: 'fixture',
        html: '',
        text: '',
      },
      'key'
    )
  ).resolves.toEqual({ success: false, suppressed: true, error: 'email_suppressed' });
  expect(transport.resend).not.toHaveBeenCalled();
});

it('passes multiple remaining real mailboxes as separate provider recipients', async () => {
  vi.stubEnv('SMTP_HOST', '');
  transport.resendSend.mockResolvedValue({ data: { id: 'real-id' } });
  const { sendEmail } = await import('./email');
  await sendEmail(['one@example.com, member@other.invalid', 'Two <two@example.com>'], {
    subject: 'fixture',
    html: '',
    text: '',
  });
  expect(transport.resendSend).toHaveBeenCalledWith(
    expect.objectContaining({ to: ['one@example.com', 'two@example.com'] }),
    undefined
  );
});

it('keeps terminal suppression separate from delivered and failed campaign sends', async () => {
  const { requireEmailDelivery } = await import('./non-sending-email');
  expect(requireEmailDelivery({ success: false, suppressed: true })).toBe('skipped');
  expect(requireEmailDelivery({ success: false, error: 'email_suppressed' })).toBe('skipped');
  expect(requireEmailDelivery({ success: true })).toBeUndefined();
  expect(() => requireEmailDelivery({ success: false, error: 'provider_failed' })).toThrow(
    'provider_failed'
  );
});
