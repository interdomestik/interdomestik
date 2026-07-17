import { compare, hash } from 'bcryptjs';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { after } from 'next/server';
import { normalizeSignInOtpLocale, sendPasswordResetEmail, sendSignInOtpEmail } from '../email';
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
  locale: 'sq' | 'en' | 'sr' | 'mk'
): void {
  after(async () => {
    try {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
        // Never throw here; the API handler already returns a generic response.
        // If email delivery is misconfigured (e.g., RESEND_API_KEY missing), we keep the UX consistent.
        await sendPasswordResetEmail(user.email, url);
      },
    },
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }, context) => {
          if (type !== 'sign-in') {
            return;
          }

          const locale = normalizeSignInOtpLocale(
            context?.request?.headers.get('x-interdomestik-locale')
          );
          scheduleSignInOtpDelivery(email, otp, locale);
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
