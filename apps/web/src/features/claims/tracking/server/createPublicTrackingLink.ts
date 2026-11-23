import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { claims, claimTrackingTokens } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import { buildClaimVisibilityWhere } from '../utils';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

// Helper to get base URL
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return 'https://www.interdomestik.com';
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

type CreatePublicTrackingLinkContext = {
  /** The request's session tenant authority; the tenant for every read and write comes from it. */
  authority: TenantAuthority;
  actorUserId: string;
  role: string;
  branchId: string | null;
};

export async function createPublicTrackingLink(
  claimId: string,
  context: CreatePublicTrackingLinkContext
): Promise<{ url: string; expiresAt: Date } | { code: 'NOT_FOUND' | 'conflict' }> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.create_link',
    { recordResponse: false },
    async () => {
      const { authority, actorUserId, role, branchId } = context;
      const { tenantId } = readTenantAuthority(authority);

      const visibility = buildClaimVisibilityWhere({
        tenantId,
        userId: actorUserId,
        role,
        branchId,
      });
      try {
        return await withTenantAuthority(authority, async tx => {
          // Serialize replacement even when the claim has no previous token.
          const [claim] = await tx
            .select({ id: claims.id })
            .from(claims)
            .where(and(eq(claims.id, claimId), visibility))
            .for('update', { noWait: true });
          if (!claim) return { code: 'NOT_FOUND' } as const;

          const token = crypto.randomBytes(32).toString('base64url');
          const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          await tx
            .update(claimTrackingTokens)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(claimTrackingTokens.claimId, claimId),
                or(
                  eq(claimTrackingTokens.tenantId, tenantId),
                  isNull(claimTrackingTokens.tenantId)
                ),
                isNull(claimTrackingTokens.revokedAt)
              )
            );
          await tx
            .insert(claimTrackingTokens)
            .values({ tenantId, claimId: claim.id, tokenHash, expiresAt });
          return { url: `${getBaseUrl()}/track/${token}`, expiresAt };
        });
      } catch (error) {
        const pgError = error instanceof Error && error.cause ? error.cause : error;
        if (
          pgError &&
          typeof pgError === 'object' &&
          'code' in pgError &&
          pgError.code === '55P03'
        ) {
          return { code: 'conflict' } as const;
        }
        throw error;
      }
    }
  );
}
