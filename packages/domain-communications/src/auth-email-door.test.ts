import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail, sendPasswordResetEmail, sendSignInOtpEmail } from './email';
import { renderPasswordResetEmail } from './email-templates';
import { renderSignInOtpEmail, type SignInOtpLocale } from './sign-in-otp-email';
import { PRODUCTION_DOOR, stubDeploymentOrigin } from './deployment-origin.test-support';
import baseline from './email/fixtures/auth-main.json';

const provider = vi.hoisted(() => ({ send: vi.fn(), smtp: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider.send };
  },
}));
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: provider.smtp }) }));

beforeEach(() => {
  stubDeploymentOrigin('production', PRODUCTION_DOOR);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider.send.mockReset().mockResolvedValue({ data: { id: 'mail' }, error: null });
  provider.smtp.mockReset().mockResolvedValue({ messageId: 'mail' });
});
afterEach(() => vi.unstubAllEnvs());

describe('auth-issued email destinations stay outside the application door', () => {
  // Fixtures are full outputs rendered from the origin/main SHA recorded in auth-main.json.
  it('renders and sends the Better Auth KS reset URL once with origin/main output parity', async () => {
    expect(renderPasswordResetEmail({ resetUrl: baseline.resetUrl })).toEqual(baseline.reset);
    await expect(sendPasswordResetEmail('member@example.test', baseline.resetUrl)).resolves.toEqual(
      {
        success: true,
        id: 'mail',
      }
    );
    expect(provider.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(baseline.reset),
      undefined
    );
    expect(provider.smtp).not.toHaveBeenCalled();
  });

  it.each(baseline.otp)(
    'sends $locale OTP under retained production www config with origin/main parity',
    async ({ locale, template }) => {
      stubDeploymentOrigin('production', 'https://www.interdomestik.com');
      const authLocale = locale as SignInOtpLocale;
      expect(renderSignInOtpEmail('123456', authLocale)).toEqual(template);
      await expect(
        sendSignInOtpEmail('member@example.test', '123456', authLocale)
      ).resolves.toEqual({
        success: true,
        id: 'mail',
      });
      expect(provider.send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining(template),
        undefined
      );
    }
  );

  it('exempts reset templates by type rather than by the supplied URL host', async () => {
    stubDeploymentOrigin('production', 'https://www.interdomestik.com');
    const resetUrl = 'https://auth.example.test/reset?token=a%2Fb&callbackURL=%2Fmember';
    await sendPasswordResetEmail('member@example.test', resetUrl);
    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send.mock.calls[0][0].text).toContain(resetUrl);
    expect(provider.send.mock.calls[0][0].html).toContain(resetUrl.replaceAll('&', '&amp;'));
  });

  it('sends declared OTP code-only content without resolving deployment configuration', async () => {
    stubDeploymentOrigin('production', 'https://www.interdomestik.com');
    await sendEmail(
      'member@example.test',
      {
        subject: 'Code',
        html: '<p>123456</p>',
        text: '123456',
      },
      { templateType: 'sign-in-otp' }
    );
    expect(provider.send).toHaveBeenCalledOnce();
  });
});
