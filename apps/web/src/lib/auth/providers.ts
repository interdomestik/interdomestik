import { compare, hash } from 'bcryptjs';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { after } from 'next/server';
import { getGitHubSocialProvider } from './social-providers';

type GitHubOAuthEnv = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

function logOtpDelivery(category: 'success' | 'failure'): void {
  if (process.env.OTP_CONTENT_FREE_LOGGING !== '1') return;
  const message = `[auth][email-otp] deferred_delivery_${category}`;
  if (category === 'failure') console.error(message);
  else console.info(message);
}

function scheduleSignInOtpDelivery(
  email: string,
  otp: string,
  localeHeader: string | null | undefined
): void {
  after(async () => {
    try {
      const { normalizeSignInOtpLocale, sendSignInOtpEmail } = await import('../email');
      const locale = normalizeSignInOtpLocale(localeHeader);
      const result = await sendSignInOtpEmail(email, otp, locale);
      logOtpDelivery(result.success ? 'success' : 'failure');
    } catch {
      logOtpDelivery('failure');
    }
  });
}

export function buildAuthProviders(env: GitHubOAuthEnv = process.env as GitHubOAuthEnv) {
  const githubProvider = getGitHubSocialProvider({
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
  });

  return {
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password: string) => hash(password, 10),
        verify: async ({ hash: hashedPassword, password }: { hash: string; password: string }) =>
          compare(password, hashedPassword),
      },
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
      // A reset ends every session of that user (ACQ-2c), including first-password activation.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({
        user,
        url,
        token,
      }: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user: any;
        url: string;
        token: string;
      }) => {
        // A rejection here never changes the generic API response; Better Auth absorbs it. A link
        // for a mailbox the account no longer uses is withdrawn and never mailed (ACQ-2c).
        const { releaseResetMailIfCurrent } = await import('./different-email-recovery-store');
        if (!(await releaseResetMailIfCurrent(user.id, token, user.email))) return;
        const { sendPasswordResetEmail } = await import('../email');
        await sendPasswordResetEmail(user.email, url);
      },
    },
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }, context) => {
          if (type !== 'sign-in') {
            return;
          }

          const localeHeader = context?.request?.headers.get('x-interdomestik-locale');
          scheduleSignInOtpDelivery(email, otp, localeHeader);
        },
        storeOTP: 'hashed',
        expiresIn: 300,
        allowedAttempts: 3,
        resendStrategy: 'rotate',
        disableSignUp: false,
      }),
    ],
    ...(githubProvider
      ? {
          socialProviders: {
            github: githubProvider,
          },
        }
      : {}),
  };
}

export const authProviders = buildAuthProviders();
