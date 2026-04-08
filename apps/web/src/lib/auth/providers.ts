import { compare, hash } from 'bcryptjs';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { sendPasswordResetEmail, sendSignInOtpEmail } from '../email';

export const authProviders = {
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
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== 'sign-in') {
          return;
        }

        const emailResult = await sendSignInOtpEmail(email, otp);
        if (!emailResult.success) {
          throw new Error(emailResult.error || 'Failed to send sign-in OTP email.');
        }
      },
      disableSignUp: false,
    }),
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
};
