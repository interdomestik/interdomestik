import { db } from '@interdomestik/database/db';
import { generateMemberNumberWithRetry } from '@interdomestik/database/member-number';
import * as Sentry from '@sentry/nextjs';
import { BetterAuthOptions } from 'better-auth';

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
  user: {
    create: {
      before: async user => {
        // Promote default 'user' role to 'member' for public registration
        // to ensure member number generation logic is triggered.
        if (user.role === 'user') {
          return {
            data: {
              ...user,
              role: 'member',
            },
          };
        }
      },
      after: async user => {
        // Assign member number to new members (post-commit hook)
        // NOTE: This is NOT transactional with user creation.
        // If this fails, the member will be created without a memberNumber.
        // Self-heal mechanisms:
        // 1. ensureMemberNumber() on login/session creation
        // 2. Daily backfill script: packages/database/src/scripts/backfill-members.ts
        if (user.role === 'member' && !user.memberNumber) {
          try {
            // Strict requirement: User MUST have a createdAt date to determine the member year.
            // Logic: Use joinedAt if available (future-proof), fallback to createdAt.
            // We do NOT default to new Date() to prevent "year drift".
            const dateSource =
              (user as typeof user & { joinedAt?: Date | string }).joinedAt ?? user.createdAt;

            if (!dateSource) {
              throw new Error('User missing joinedAt/createdAt - cannot determine member year');
            }
            const joinedAt = new Date(dateSource);

            const result = await generateMemberNumberWithRetry(db, {
              userId: user.id,
              joinedAt,
            });
            console.log(`[Auth] Member number ${result.memberNumber} assigned to user ${user.id}`);
          } catch (error) {
            const err = error as Error;
            // Capture to Sentry with enriched context for fast triage
            Sentry.captureException(err, {
              tags: {
                component: 'auth.databaseHooks',
                action: 'generateMemberNumber',
                phase: 'user.create.after',
              },
              extra: {
                userId: user.id,
                email: (user as typeof user & { email?: string }).email ?? null,
                tenantId: (user as typeof user & { tenantId?: string }).tenantId ?? null,
                memberNumber:
                  (user as typeof user & { memberNumber?: string }).memberNumber ?? null,
              },
            });
            console.error(`[Auth] Failed to assign member number to ${user.id}:`, err);
            // Do NOT throw - registration should still succeed
          }
        }
      },
    },
  },
  session: {
    create: {
      after: async session => {
        // Self-heal: Ensure member has a memberNumber on login
        // Guarantee: This is the primary reliability mechanism

        // Optimization: Pre-check user role + memberNumber to avoid
        // transaction overhead for staff/admin and already-numbered members.
        if (session.userId) {
          try {
            // Quick read to check if we need to do anything + get createdAt for year
            const { user: userTable } = await import('@interdomestik/database/schema');
            const { eq } = await import('drizzle-orm');
            const existing = await db
              .select({
                role: userTable.role,
                memberNumber: userTable.memberNumber,
                createdAt: userTable.createdAt,
                email: userTable.email,
                tenantId: userTable.tenantId,
              })
              .from(userTable)
              .where(eq(userTable.id, session.userId))
              .limit(1);

            // Skip if not a member or already has number
            if (!existing[0] || existing[0].role !== 'member' || existing[0].memberNumber) {
              return;
            }

            // Member needs a number - strictly use joinedAt ?? createdAt year
            // Note: joinedAt is not yet in schema, but logical precedence is prepared.
            const dateSource =
              (existing[0] as (typeof existing)[0] & { joinedAt?: Date | string }).joinedAt ??
              existing[0].createdAt;

            if (!dateSource) {
              throw new Error('User missing joinedAt/createdAt - cannot determine member year');
            }
            const joinedAt = new Date(dateSource);

            const result = await generateMemberNumberWithRetry(db, {
              userId: session.userId,
              joinedAt,
            });
            if (result.isNew) {
              console.log(
                `[Auth:SelfHeal] Member number ${result.memberNumber} assigned on login for ${session.userId}`
              );
            }
          } catch (error) {
            // Capture self-heal failures to Sentry for visibility
            Sentry.captureException(error, {
              tags: {
                component: 'auth.databaseHooks',
                action: 'generateMemberNumber',
                phase: 'session.create.after (self-heal)',
              },
              extra: { userId: session.userId },
            });
          }
        }
      },
    },
  },
};
