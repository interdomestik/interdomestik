import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmailOutcome } from './email';

const { sendMail, sendResend } = vi.hoisted(() => ({ sendMail: vi.fn(), sendResend: vi.fn() }));

vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendResend };
  },
}));

const recipient = 'member@example.com';
const rendered = { subject: 'Claim update', html: '<p>Update</p>', text: 'Update' };
const options = { idempotencyKey: 'claim-delivery-42', timeoutMs: 50 };

describe('sendEmailOutcome', () => {
  beforeEach(() => {
    sendMail.mockReset();
    sendResend.mockReset();
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
    vi.stubEnv('PLAYWRIGHT', '0');
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_PORT', '1025');
    vi.stubEnv('RESEND_API_KEY', 'mock-key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'sender@example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('uses SMTP first and reports acceptance', async () => {
    sendMail.mockResolvedValue({ messageId: 'smtp-message' });
    await expect(sendEmailOutcome(recipient, rendered, options)).resolves.toEqual({
      ok: true,
      transport: 'smtp',
    });
    expect(sendMail).toHaveBeenCalledWith({
      ...rendered,
      from: 'sender@example.com',
      to: recipient,
    });
    expect(sendResend).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'ECONNREFUSED' },
    { code: 'ESOCKET', command: 'CONN', syscall: 'connect' },
    { code: 'ETLS', command: 'STARTTLS' },
    { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 },
    { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 },
  ])('falls back with the idempotency key after a pre-acceptance failure (%j)', async fields => {
    sendMail.mockRejectedValue(Object.assign(new Error('SMTP failure'), fields));
    sendResend.mockResolvedValue({ data: { id: 'resend-message' }, error: null });
    await expect(sendEmailOutcome(recipient, rendered, options)).resolves.toEqual({
      ok: true,
      transport: 'resend',
    });
    expect(sendResend).toHaveBeenCalledExactlyOnceWith(
      { ...rendered, from: 'sender@example.com', to: recipient },
      { idempotencyKey: options.idempotencyKey }
    );
  });

  it.each([
    { code: 'EENVELOPE', command: 'DATA', responseCode: 554 },
    { code: 'ECONNECTION', command: 'CONN' },
    { code: 'ETIMEDOUT', command: 'CONN' },
  ])('does not fall back when acceptance is uncertain (%j)', async fields => {
    sendMail.mockRejectedValue(Object.assign(new Error('SMTP failure'), fields));
    await expect(sendEmailOutcome(recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      ambiguous: true,
      retryable: true,
    });
    expect(sendResend).not.toHaveBeenCalled();
  });

  it('returns at the timeout and prevents fallback after a late pre-acceptance error', async () => {
    vi.useFakeTimers();
    let rejectSmtp: (error: Error) => void = () => {};
    sendMail.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSmtp = reject;
      })
    );

    const result = sendEmailOutcome(recipient, rendered, options);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);
    await expect(result).resolves.toEqual({
      ok: false,
      ambiguous: true,
      retryable: true,
      code: 'timeout',
      detail: 'smtp timeout',
    });
    rejectSmtp(Object.assign(new Error('late connection error'), { code: 'ECONNREFUSED' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(sendResend).not.toHaveBeenCalled();
  });

  it('uses a single timeout budget across SMTP and Resend', async () => {
    vi.useFakeTimers();
    sendMail.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(
            () => reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })),
            40
          );
        })
    );
    sendResend.mockReturnValue(new Promise(() => {}));

    const result = sendEmailOutcome(recipient, rendered, options);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);
    await expect(result).resolves.toMatchObject({
      ok: false,
      code: 'timeout',
      detail: 'resend timeout',
    });
    expect(sendResend).toHaveBeenCalledOnce();
  });

  it('limits SMTP failure details to known codes and numeric statuses', async () => {
    sendMail.mockRejectedValue({
      code: recipient,
      command: 'DATA',
      responseCode: 554,
      message: `${recipient} private-token private-body`,
      response: `554 ${recipient}`,
    });
    await expect(sendEmailOutcome(recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      code: 'smtp_ambiguous',
      detail: 'smtp 554',
    });
  });

  it('limits Resend failure details to known codes and statuses', async () => {
    vi.stubEnv('SMTP_HOST', '');
    sendResend.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: `Provider error for ${recipient}` },
    });
    await expect(sendEmailOutcome(recipient, rendered, options)).resolves.toEqual({
      ok: false,
      retryable: true,
      ambiguous: false,
      code: 'resend_failed',
      detail: 'resend rate_limit_exceeded 429',
    });
  });
});
