import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  smtp: vi.fn(),
  sendMail: vi.fn(),
  resend: vi.fn(),
  resendSend: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('nodemailer', () => ({ createTransport: transport.smtp }));
vi.mock('resend', () => ({
  Resend: function MockResend() {
    transport.resend();
    return { emails: { send: transport.resendSend } };
  },
}));

const template = { subject: 'fixture', html: '', text: '' };
const suppressed = { success: false, suppressed: true, error: 'email_suppressed' };
const outcomeOptions = { idempotencyKey: 'key', timeoutMs: 1000 };
const DEPLOYMENT_KEYS = [
  'VERCEL',
  'VERCEL_URL',
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'INTERDOMESTIK_DEPLOY_ENV',
  'EMAIL_RECIPIENT_ALLOWLIST',
  'SMTP_HOST',
  'E2E_SMTP_HOST',
];

function hostedStaging(allowList?: string) {
  // The new staging is its own Vercel project, so its runtime reports VERCEL_ENV=production.
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'staging');
  if (allowList !== undefined) vi.stubEnv('EMAIL_RECIPIENT_ALLOWLIST', allowList);
}

const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  vi.resetModules();
  for (const key of DEPLOYMENT_KEYS) vi.stubEnv(key, undefined);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  vi.stubGlobal('fetch', transport.fetch);
  transport.smtp.mockReturnValue({ sendMail: transport.sendMail });
  transport.sendMail.mockResolvedValue({ messageId: 'catcher-id', accepted: ['x'] });
  transport.resendSend.mockResolvedValue({ data: { id: 'sent-id' } });
  transport.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'outcome-id' })));
  consoleSpies.length = 0;
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    consoleSpies.push(vi.spyOn(console, level).mockImplementation(() => undefined));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const consoleCalls = () => consoleSpies.flatMap(spy => spy.mock.calls);
const refusals = () =>
  consoleCalls()
    .filter(([tag]) => tag === '[EmailAllowList]')
    .map(([, event]) => event);
const providerCalls = () =>
  transport.resend.mock.calls.length +
  transport.resendSend.mock.calls.length +
  transport.smtp.mock.calls.length +
  transport.fetch.mock.calls.length;

describe('staging recipient allow-list', () => {
  it.each([
    ['exact mailbox', 'qa@office.example.test', 'QA <QA@Office.Example.Test>'],
    ['domain', 'office.example.test', 'anyone@office.example.test'],
    ['@domain', '@office.example.test', 'anyone@OFFICE.example.test.'],
  ])('sends to an allowed recipient on staging (%s)', async (_kind, allowList, to) => {
    const address = to.includes('<') ? to.slice(to.indexOf('<') + 1, -1) : to;
    hostedStaging(` other@else.example.test , ${allowList}`);
    const { sendEmail, sendEmailOutcome } = await import('./email');
    await expect(sendEmail(to, template)).resolves.toEqual({ success: true, id: 'sent-id' });
    expect(transport.resendSend).toHaveBeenCalledTimes(1);
    expect(transport.resendSend.mock.calls[0][0].to).toBe(address);
    await expect(sendEmailOutcome('resend', to, template, outcomeOptions)).resolves.toEqual({
      ok: true,
      transport: 'resend',
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = transport.fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body).to).toEqual([address]);
    expect(refusals()).toEqual([]);
  });

  it.each([
    'real.person@gmail.example',
    'qa@sub.office.example.test',
    'other@office.example.test.evil.test',
    '"qa@office.example.test" <victim@evil.test>',
    '"qa@office.example.test"@office.example.test',
    'qa@office.example.test@evil.test',
  ])('refuses and records a recipient that is not allowed: %s', async to => {
    hostedStaging('qa@office.example.test,sandbox.example.test');
    const { sendEmail, isEmailSuppressed, sendEmailOutcome, sendPaymentReminderEmail } =
      await import('./email');
    await expect(sendEmail(to, template)).resolves.toEqual(suppressed);
    expect(isEmailSuppressed(to, true)).toBe(true);
    await expect(sendEmailOutcome('resend', to, template, outcomeOptions)).resolves.toMatchObject({
      ok: false,
      retryable: false,
      code: 'email_suppressed',
    });
    await expect(
      sendPaymentReminderEmail(to, {
        memberName: 'M',
        planName: 'P',
        daysRemaining: 7,
        gracePeriodEndDate: 'D',
      })
    ).resolves.toEqual(suppressed);
    expect(providerCalls()).toBe(0);
    expect(refusals().length).toBeGreaterThan(0);
    for (const event of refusals()) {
      expect(event).toEqual({ outcome: 'refused', reason: 'recipient_not_allowlisted' });
    }
    expect(JSON.stringify(consoleCalls())).not.toContain('@');
  });

  it('refuses a non-ASCII spelling that case folding would map onto a listed mailbox', async () => {
    hostedStaging('k@office.example.test,kelvin.example.test');
    const { sendEmail } = await import('./email');
    for (const to of ['\u212A@office.example.test', 'qa@\u212Aelvin.example.test']) {
      await expect(sendEmail(to, template)).resolves.toEqual(suppressed);
    }
    expect(providerCalls()).toBe(0);
    expect(refusals()).toHaveLength(2);
  });

  it('keeps only the allowed mailboxes of a mixed recipient list', async () => {
    hostedStaging('office.example.test');
    const { sendEmail } = await import('./email');
    await sendEmail(['a@office.example.test, real@gmail.example', 'B <b@office.example.test>'], {
      ...template,
    });
    expect(transport.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@office.example.test', 'b@office.example.test'] }),
      undefined
    );
    expect(refusals()).toHaveLength(1);
  });

  it.each([
    undefined,
    '',
    '  ,  ',
    '@',
    'garbage',
    'qa@garbage',
    '*.example.test',
    'a@b@c.test',
    '\u212A@office.example.test',
  ])('refuses everything when the staging allow-list has no valid entry (%s)', async allowList => {
    hostedStaging(allowList);
    const { sendEmail, sendPasswordResetEmail } = await import('./email');
    await expect(sendEmail('k@office.example.test', template)).resolves.toEqual(suppressed);
    await expect(
      sendPasswordResetEmail('qa@office.example.test', 'https://staging.example/reset')
    ).resolves.toEqual(suppressed);
    expect(providerCalls()).toBe(0);
    expect(refusals()).toEqual([
      { outcome: 'refused', reason: 'allowlist_empty' },
      { outcome: 'refused', reason: 'allowlist_empty' },
    ]);
  });

  it('never lifts the reserved-domain rule on staging, even for a listed .invalid domain', async () => {
    hostedStaging('other.invalid');
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '1');
    vi.stubEnv('E2E_SMTP_HOST', '127.0.0.1');
    const { sendSignInOtpEmail } = await import('./email');
    await expect(sendSignInOtpEmail('member@other.invalid', '123456')).resolves.toEqual(suppressed);
    expect(providerCalls()).toBe(0);
  });

  it('keeps the local automated loopback catcher working where the gate is off', async () => {
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '1');
    vi.stubEnv('E2E_SMTP_HOST', '127.0.0.1');
    const { sendSignInOtpEmail } = await import('./email');
    await expect(sendSignInOtpEmail('member@other.invalid', '123456')).resolves.toEqual({
      success: true,
      id: 'catcher-id',
    });
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'member@other.invalid' })
    );
    expect(refusals()).toEqual([]);
  });
});

describe('recipient policy by deployment', () => {
  it('records the hosted refusal once, also for a reserved recipient through the catcher', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '1');
    vi.stubEnv('E2E_SMTP_HOST', '127.0.0.1');
    const { sendSignInOtpEmail } = await import('./email');
    await expect(
      sendSignInOtpEmail('member@other.invalid, qa@office.example.test', '123456')
    ).resolves.toEqual(suppressed);
    expect(providerCalls()).toBe(0);
    expect(consoleCalls()).toEqual([
      ['[EmailAllowList]', { outcome: 'refused', reason: 'deploy_env_unknown' }],
    ]);
  });

  it.each([
    [{ VERCEL: '1', VERCEL_ENV: 'production', INTERDOMESTIK_DEPLOY_ENV: 'staging' }, 'allowlist'],
    [{ VERCEL: '1', VERCEL_ENV: 'preview', INTERDOMESTIK_DEPLOY_ENV: ' Staging ' }, 'allowlist'],
    [{ INTERDOMESTIK_DEPLOY_ENV: 'staging' }, 'allowlist'],
    [{ VERCEL: '1', VERCEL_ENV: 'production', INTERDOMESTIK_DEPLOY_ENV: 'production' }, 'open'],
    [{ VERCEL: '1', VERCEL_ENV: 'production' }, 'refuse_all'],
    [{ VERCEL: '1', VERCEL_ENV: 'preview' }, 'refuse_all'],
    [{ VERCEL_URL: 'x.vercel.app' }, 'refuse_all'],
    [{ VERCEL_TARGET_ENV: 'production' }, 'refuse_all'],
    [{ VERCEL: '1', INTERDOMESTIK_DEPLOY_ENV: 'stagng' }, 'refuse_all'],
    [{ VERCEL: '1', INTERDOMESTIK_DEPLOY_ENV: 'local' }, 'refuse_all'],
    [{ VERCEL: '1', INTERDOMESTIK_DEPLOY_ENV: '' }, 'refuse_all'],
    [{ INTERDOMESTIK_DEPLOY_ENV: 'preview' }, 'refuse_all'],
    [{ INTERDOMESTIK_DEPLOY_ENV: 'local' }, 'open'],
    [{ INTERDOMESTIK_DEPLOY_ENV: 'development' }, 'open'],
    [{ INTERDOMESTIK_DEPLOY_ENV: 'production' }, 'open'],
    [{ EMAIL_RECIPIENT_ALLOWLIST: 'qa@office.example.test' }, 'open'],
    [{}, 'open'],
  ])('%o -> %s', async (env, policy) => {
    const { recipientPolicy } = await import('./recipient-allow-list');
    expect(recipientPolicy(env)).toBe(policy);
  });

  it.each([
    ['unset', undefined],
    ['unknown', 'stagng'],
  ])(
    'refuses and records every send on a hosted runtime with the deploy env %s',
    async (_kind, deployEnv) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_ENV', 'production');
      if (deployEnv) vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', deployEnv);
      vi.stubEnv('EMAIL_RECIPIENT_ALLOWLIST', 'office.example.test');
      const { sendEmail, sendEmailOutcome } = await import('./email');
      await expect(sendEmail('qa@office.example.test', template)).resolves.toEqual(suppressed);
      await expect(
        sendEmailOutcome('resend', 'qa@office.example.test', template, outcomeOptions)
      ).resolves.toMatchObject({ ok: false, retryable: false, code: 'email_suppressed' });
      expect(providerCalls()).toBe(0);
      const refused = ['[EmailAllowList]', { outcome: 'refused', reason: 'deploy_env_unknown' }];
      expect(consoleCalls()).toEqual([refused, refused]);
    }
  );

  it.each([undefined, 'office.example.test'])(
    'leaves hosted production unchanged (allow-list %s)',
    async allowList => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'production');
      if (allowList) vi.stubEnv('EMAIL_RECIPIENT_ALLOWLIST', allowList);
      const { sendEmail, sendEmailOutcome } = await import('./email');
      await expect(sendEmail('anyone@gmail.example', template)).resolves.toEqual({
        success: true,
        id: 'sent-id',
      });
      await expect(
        sendEmailOutcome('resend', 'anyone@gmail.example', template, outcomeOptions)
      ).resolves.toEqual({ ok: true, transport: 'resend' });
      expect(refusals()).toEqual([]);
    }
  );

  it('leaves local development unchanged without any allow-list', async () => {
    vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'local');
    const { sendEmail } = await import('./email');
    await expect(sendEmail('anyone@gmail.example', template)).resolves.toEqual({
      success: true,
      id: 'sent-id',
    });
    expect(refusals()).toEqual([]);
  });
});
