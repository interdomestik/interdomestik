import { EventEmitter } from 'node:events';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEmailTransports, sendEmailOutcome } from './email';

const { sendMail, fetchEmail, createTransport, createConnection } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    sendMail,
    fetchEmail: vi.fn(),
    createTransport: vi.fn((_options: SMTPTransport.Options) => ({ sendMail })),
    createConnection: vi.fn(),
  };
});
vi.mock('nodemailer', () => ({ createTransport }));
vi.mock('node:net', async importOriginal => ({
  ...(await importOriginal<typeof import('node:net')>()),
  createConnection,
}));

const recipient = 'member@example.com';
const rendered = { subject: 'Claim\r\n update', html: '<p>Update</p>', text: 'Update' };
const options = { idempotencyKey: 'dlv-42', timeoutMs: 50 };

describe('sendEmailOutcome', () => {
  beforeEach(() => {
    sendMail.mockReset();
    fetchEmail.mockReset();
    createTransport.mockClear();
    createConnection.mockReset();
    vi.stubGlobal('fetch', fetchEmail);
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
    vi.stubEnv('PLAYWRIGHT', '0');
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_PORT', '1025');
    vi.stubEnv('E2E_SMTP_HOST', '');
    vi.stubEnv('E2E_SMTP_PORT', '');
    vi.stubEnv('RESEND_API_KEY', 'mock-key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'sender@example.com');
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('uses the validated automated SMTP target even when production transports are configured', async () => {
    vi.stubEnv('PLAYWRIGHT', '1');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('E2E_SMTP_HOST', ' 127.0.0.1 ');
    vi.stubEnv('E2E_SMTP_PORT', ' 2525 ');
    sendMail.mockResolvedValue({ accepted: [recipient] });

    expect(configuredEmailTransports()).toEqual(['smtp']);
    await expect(sendEmailOutcome('smtp', recipient, rendered, options)).resolves.toEqual({
      ok: true,
      transport: 'smtp',
    });
    await expect(sendEmailOutcome('resend', recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      code: 'email_unconfigured',
    });
    expect(createTransport).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 2525,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 5000,
        socketTimeout: 10000,
      })
    );
    expect(sendMail).toHaveBeenCalledOnce();
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['smtp.example.com', '2525'],
    ['127.0.0.1', '65536'],
  ])('refuses invalid automated SMTP target %s:%s', async (host, port) => {
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '1');
    vi.stubEnv('E2E_SMTP_HOST', host);
    vi.stubEnv('E2E_SMTP_PORT', port);

    expect(configuredEmailTransports()).toEqual([]);
    await expect(sendEmailOutcome('smtp', recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      code: 'email_unconfigured',
    });
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(fetchEmail).not.toHaveBeenCalled();
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
    ['smtp', sendMail, 'smtp_ambiguous'],
    ['resend', fetchEmail, 'resend_unknown'],
  ] as const)('logs only the classified %s failure code', async (transport, provider, code) => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    provider.mockRejectedValue(
      Object.assign(new Error('member@example.com and private message'), {
        name: 'ProviderRefA123',
        code: 'PROVIDER_REF_123',
      })
    );

    await expect(sendEmailOutcome(transport, recipient, rendered, options)).resolves.toMatchObject({
      ok: false,
      code,
    });
    expect(provider).toHaveBeenCalledOnce();
    expect(logger.mock.calls).toEqual([[{ code }]]);
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
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    expect(logger.mock.calls).toEqual([[{ code: 'timeout' }]]);
  });

  it('aborts the SMTP socket at the absolute deadline and keeps the outcome ambiguous', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SMTP_PORT', '2527');
    const socket = Object.assign(new EventEmitter(), { setTimeout: vi.fn() });
    createConnection.mockReturnValue(socket);
    createTransport.mockImplementationOnce(transportOptions => ({
      sendMail: sendMail.mockImplementation(
        () => new Promise(() => transportOptions.getSocket?.(transportOptions, () => {}))
      ),
    }));

    const result = sendEmailOutcome('smtp', recipient, rendered, options);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);

    await expect(result).resolves.toMatchObject({
      ok: false,
      ambiguous: true,
      preAcceptance: false,
      code: 'timeout',
    });
    expect(createConnection).toHaveBeenCalledExactlyOnceWith({
      host: 'localhost',
      port: 2527,
      signal: expect.objectContaining({ aborted: true }),
    });
    expect(fetchEmail).not.toHaveBeenCalled();
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
