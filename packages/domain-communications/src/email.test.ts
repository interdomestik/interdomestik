import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('resend', () => ({
  Resend: function MockResend(...args: unknown[]) {
    m.resendConstructor(...args);
    return {
      emails: {
        send: m.resendSend,
      },
    };
  },
}));

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
