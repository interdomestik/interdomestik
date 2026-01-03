import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sendPasswordResetEmail } from './email';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    additionalFields: {
      tenantId: {
        type: 'string',
        fieldName: 'tenantId',
        defaultValue: 'tenant_mk',
      },
      role: {
        type: 'string',
        defaultValue: 'user',
      },
      memberNumber: {
        type: 'string',
        fieldName: 'memberNumber',
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    sendResetPassword: async ({ user, url }) => {
      // Never throw here; the API handler already returns a generic response.
      // If email delivery is misconfigured (e.g., RESEND_API_KEY missing), we keep the UX consistent.
      await sendPasswordResetEmail(user.email, url);
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
