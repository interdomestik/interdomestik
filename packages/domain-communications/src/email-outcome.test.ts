import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEmailTransports, sendEmailOutcome } from './email';

const { sendMail, fetchEmail } = vi.hoisted(() => ({ sendMail: vi.fn(), fetchEmail: vi.fn() }));
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));

const recipient = 'member@example.com';
const rendered = { subject: 'Claim\r\n update', html: '<p>Update</p>', text: 'Update' };
const options = { idempotencyKey: 'claim-delivery-42', timeoutMs: 50 };

describe('sendEmailOutcome', () => {
  beforeEach(() => {
    sendMail.mockReset();
    fetchEmail.mockReset();
    vi.stubGlobal('fetch', fetchEmail);
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
    vi.stubEnv('PLAYWRIGHT', '0');
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_PORT', '1025');
    vi.stubEnv('RESEND_API_KEY', 'mock-key');
    vi.stubEnv('RESEND_BASE_URL', '');
    vi.stubEnv('RESEND_FROM_EMAIL', 'sender@example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports configuration in preferred order and respects automation', () => {
    expect(configuredEmailTransports()).toEqual(['smtp', 'resend']);
    vi.stubEnv('SMTP_HOST', '');
    expect(configuredEmailTransports()).toEqual(['resend']);
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '1');
    expect(configuredEmailTransports()).toEqual([]);
  });

  it('uses only SMTP and strips subject line breaks', async () => {
    sendMail.mockResolvedValue({ accepted: [recipient] });
    await expect(sendEmailOutcome('smtp', recipient, rendered, options)).resolves.toEqual({
      ok: true,
      transport: 'smtp',
    });
    expect(sendMail).toHaveBeenCalledExactlyOnceWith({
      ...rendered,
      from: 'sender@example.com',
      to: recipient,
      subject: 'Claim update',
    });
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it('uses only Resend and sends the stable idempotency key', async () => {
    fetchEmail.mockResolvedValue(Response.json({ id: 'receipt' }));
    await expect(sendEmailOutcome('resend', recipient, rendered, options)).resolves.toEqual({
      ok: true,
      transport: 'resend',
    });
    expect(fetchEmail).toHaveBeenCalledExactlyOnceWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': options.idempotencyKey }),
      })
    );
    expect(JSON.parse(fetchEmail.mock.calls[0][1].body)).toMatchObject({
      subject: 'Claim update',
      to: [recipient],
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'ECONNREFUSED', command: 'CONN' }, true],
    [{ code: 'EDNS' }, true],
    [{ code: 'ETLS' }, true],
    [{ code: 'EAUTH' }, true],
    [{ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 }, true],
    [{ code: 'EENVELOPE', command: 'DATA', responseCode: 550 }, false],
    [{ code: 'ETIMEDOUT', command: 'RCPT TO' }, false],
    [{ code: 'ECONNRESET', command: 'CONN' }, false],
  ])('classifies SMTP %o without calling Resend', async (error, preAcceptance) => {
    sendMail.mockRejectedValue(error);
    await expect(sendEmailOutcome('smtp', recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      preAcceptance,
      ambiguous: !preAcceptance,
    });
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 422, 429, 409, 500])('classifies Resend HTTP %i', async status => {
    fetchEmail.mockResolvedValue(new Response('private response text', { status }));
    await expect(sendEmailOutcome('resend', recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      preAcceptance: [400, 401, 403, 422, 429].includes(status),
      detail: `resend ${status}`,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ECONNRESET'])(
    'classifies Resend network cause %s',
    async code => {
      fetchEmail.mockRejectedValue(new Error('private address', { cause: { code } }));
      await expect(sendEmailOutcome('resend', recipient, rendered, options)).resolves.toMatchObject(
        {
          ok: false,
          preAcceptance: code !== 'ECONNRESET',
        }
      );
    }
  );

  it('treats a missing provider receipt as ambiguous', async () => {
    fetchEmail.mockResolvedValue(Response.json({}));
    sendMail.mockResolvedValue(undefined);
    for (const transport of ['smtp', 'resend'] as const) {
      await expect(
        sendEmailOutcome(transport, recipient, rendered, options)
      ).resolves.toMatchObject({
        ok: false,
        ambiguous: true,
        preAcceptance: false,
      });
    }
  });

  it('times out one Resend call without switching transport', async () => {
    vi.useFakeTimers();
    fetchEmail.mockReturnValue(new Promise(() => {}));
    const result = sendEmailOutcome('resend', recipient, rendered, options);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);
    await expect(result).resolves.toMatchObject({
      ok: false,
      ambiguous: true,
      preAcceptance: false,
      code: 'timeout',
    });
    expect(fetchEmail.mock.calls[0][1].signal.aborted).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('suppresses invalid addresses and refuses an unconfigured named provider', async () => {
    await expect(
      sendEmailOutcome('smtp', 'member@example.invalid', rendered, options)
    ).resolves.toMatchObject({ ok: false, code: 'email_suppressed' });
    vi.stubEnv('SMTP_HOST', '');
    await expect(sendEmailOutcome('smtp', recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      code: 'email_unconfigured',
      retryable: true,
    });
    expect(fetchEmail).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
