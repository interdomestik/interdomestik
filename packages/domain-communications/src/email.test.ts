import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// prettier-ignore
const localizedOtpCopy = [
  ['sq', 'Kodi juaj për konfirmimin e email-it', 'Përdoreni kodin me 6 shifra për të konfirmuar email-in dhe për të vazhduar. Vlen 5 minuta; vlen vetëm kodi më i ri. Nuk konfirmon pagesë, anëtarësi aktive, kërkesë për dëm apo rast të pranuar.'],
  ['en', 'Your email confirmation code', 'Use the 6-digit code to confirm your email and continue. It expires in 5 minutes; only the newest code works. It does not confirm payment, active membership, a claim, or an accepted case.'],
  ['sr', 'Kod za potvrdu e-adrese', 'Upotrebite kod od 6 cifara da potvrdite e-adresu i nastavite. Važi 5 minuta; važi samo najnoviji kod. Ne potvrđuje uplatu, aktivno članstvo, zahtev niti prihvaćen predmet.'],
  ['mk', 'Код за потврда на е-поштата', 'Користете го 6-цифрениот код за да ја потврдите е-поштата и да продолжите. Важи 5 минути; важи само најновиот код. Не потврдува плаќање, активно членство, барање за надомест или прифатен случај.'],
] as const;
// prettier-ignore
const m = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  createTransport: vi.fn(), dbInsert: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findManyLogs: vi.fn(), inArray: vi.fn((left: unknown, right: unknown[]) => ({ op: 'inArray', left, right })),
  nanoid: vi.fn(() => 'test-id-123'), or: vi.fn((...conditions: unknown[]) => ({ op: 'or', conditions })),
  resendConstructor: vi.fn(), resendSend: vi.fn(), sendMail: vi.fn(),
  txInsert: vi.fn(), txValues: vi.fn(), withTenantContext: vi.fn(),
}));
// prettier-ignore
vi.mock('nodemailer', () => ({ default: { createTransport: m.createTransport }, createTransport: m.createTransport }));
// prettier-ignore
vi.mock('resend', () => ({ Resend: function MockResend(...args: unknown[]) { m.resendConstructor(...args); return { emails: { send: m.resendSend } }; } }));
// prettier-ignore
vi.mock('@interdomestik/database', () => ({ db: { insert: m.dbInsert, query: { emailCampaignLogs: { findMany: m.findManyLogs } } }, inArray: m.inArray, withTenantContext: m.withTenantContext }));
// prettier-ignore
vi.mock('@interdomestik/database/schema', () => ({ emailCampaignLogs: { campaignId: 'emailCampaignLogs.campaignId', tenantId: 'emailCampaignLogs.tenantId', userId: 'emailCampaignLogs.userId' } }));
vi.mock('drizzle-orm', () => ({ and: m.and, eq: m.eq, or: m.or }));
vi.mock('nanoid', () => ({ nanoid: m.nanoid }));
describe('email delivery fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
    vi.stubEnv('PLAYWRIGHT', '0');
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_PORT', '1025');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'support@interdomestik.com');
    m.createTransport.mockReturnValue({
      sendMail: m.sendMail,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('falls back to Resend when SMTP transport fails', async () => {
    m.sendMail.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    m.resendSend.mockResolvedValueOnce({
      data: { id: 'resend-message-id' },
      error: null,
    });
    const { sendPasswordResetEmail } = await import('./email');
    const result = await sendPasswordResetEmail(
      'member@example.com',
      'https://app.interdomestik.com/reset-password?token=abc'
    );
    expect(result).toEqual({ success: true, id: 'resend-message-id' });
    expect(m.sendMail).toHaveBeenCalledOnce();
    expect(m.resendConstructor).toHaveBeenCalledWith('re_test_key');
    expect(m.resendSend).toHaveBeenCalledOnce();
  });
  it.each(['mock', 'smtp', 'resend', 'fallback'] as const)(
    'keeps %s OTP telemetry content-free',
    async provider => {
      vi.resetModules();
      vi.stubEnv('INTERDOMESTIK_AUTOMATED', provider === 'mock' ? '1' : '0');
      vi.stubEnv('SMTP_HOST', ['smtp', 'fallback'].includes(provider) ? 'localhost' : '');
      vi.stubEnv('RESEND_API_KEY', ['resend', 'fallback'].includes(provider) ? 're_key' : '');
      m.sendMail.mockReset();
      m.resendSend.mockReset();
      m.sendMail.mockImplementation(() =>
        provider === 'fallback'
          ? Promise.reject(new Error('RAW_PROVIDER_FAILURE'))
          : Promise.resolve({ messageId: 'private-message-id' })
      );
      m.resendSend.mockResolvedValue({ data: { id: 'private-resend-id' }, error: null });
      const spies = [console.log, console.warn, console.error].map((_, index) =>
        vi.spyOn(console, ['log', 'warn', 'error'][index] as 'log').mockImplementation(() => {})
      );
      const { sendEmail } = await import('./email');
      await sendEmail(
        'private@example.com',
        { subject: 'PRIVATE SUBJECT', html: '<p>654321</p>', text: '654321' },
        { telemetryPolicy: 'content-free' }
      );
      const logs = JSON.stringify(spies.flatMap(spy => spy.mock.calls));
      expect(logs).toContain(provider);
      for (const forbidden of [
        'private@example.com',
        'PRIVATE SUBJECT',
        '654321',
        'private-message-id',
        'private-resend-id',
        'RAW_PROVIDER_FAILURE',
      ]) {
        expect(logs).not.toContain(forbidden);
      }
      if (provider === 'resend') {
        m.resendSend.mockResolvedValueOnce({ data: {}, error: null });
        const missingId = await sendEmail(
          'private@example.com',
          { subject: '', html: '', text: '' },
          { telemetryPolicy: 'content-free' }
        );
        expect(missingId).toEqual({ success: false, error: 'email_provider_failed' });
      }
    }
  );
  it.each(localizedOtpCopy)(
    'renders neutral %s OTP text and HTML',
    async (locale, subject, body) => {
      m.sendMail.mockResolvedValue({ messageId: 'message-id' });
      const { sendSignInOtpEmail } = await import('./email');
      await sendSignInOtpEmail('person@example.com', '123456', locale);
      const message = m.sendMail.mock.calls[0]?.[0];
      expect(message).toEqual(expect.objectContaining({ subject, text: `${body}\n\n123456` }));
      expect(message.html).toContain(body);
      expect(message.html.toLowerCase()).not.toContain('membership checkout');
    }
  );
  it('preserves default SMTP recipient and message logging', async () => {
    m.sendMail.mockResolvedValue({ messageId: 'default-message-id' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendEmail } = await import('./email');
    await sendEmail('member@example.com', { subject: 'Default', html: '', text: '' });
    expect(log).toHaveBeenCalledWith('[SMTP] Email sent to member@example.com: default-message-id');
  });
});
// prettier-ignore
describe('campaign execution tenant-context writes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.findManyLogs.mockResolvedValue([]); m.nanoid.mockReturnValue('test-id-123');
    m.txInsert.mockReturnValue({ values: m.txValues }); m.txValues.mockResolvedValue(undefined);
    m.withTenantContext.mockImplementation(async (_context: { tenantId: string; role: string }, action: (tx: unknown) => Promise<void>) => await action({ insert: m.txInsert }));
  });
  it('writes campaign logs through each item tenant context', async () => {
    const { executeCampaign, processCampaignUser } = await import('./campaign-execution');
    await processCampaignUser({ email: 'member@example.com', id: 'user-1', name: 'Member One', tenantId: 'tenant-1' }, { campaignId: 'campaign-1', sendToUser: vi.fn().mockResolvedValue(undefined) }, new Set(), { attempted: 0, sent: 0, skipped: 0 }, [], []);
    await executeCampaign('campaign-2', vi.fn().mockResolvedValueOnce([{ email: 'member@example.com', id: 'item-1', tenantId: 'tenant-2', userId: 'user-2' }]).mockResolvedValueOnce([]), vi.fn().mockResolvedValue(undefined), { errors: [], logs: [], stats: { attempted: 0, failed: 0, sent: 0, skipped: 0 } });
    expect(m.withTenantContext).toHaveBeenNthCalledWith(1, { tenantId: 'tenant-1', role: 'system' }, expect.any(Function));
    expect(m.withTenantContext).toHaveBeenNthCalledWith(2, { tenantId: 'tenant-2', role: 'system' }, expect.any(Function));
    expect(m.txValues).toHaveBeenNthCalledWith(1, expect.objectContaining({ campaignId: 'campaign-1', tenantId: 'tenant-1', userId: 'user-1' }));
    expect(m.txValues).toHaveBeenNthCalledWith(2, expect.objectContaining({ campaignId: 'campaign-2', tenantId: 'tenant-2', userId: 'user-2' }));
    expect(m.dbInsert).not.toHaveBeenCalled();
  });
});
