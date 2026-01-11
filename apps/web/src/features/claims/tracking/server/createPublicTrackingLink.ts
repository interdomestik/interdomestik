import { db } from '@interdomestik/database';
import { claims, claimTrackingTokens } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { buildClaimVisibilityWhere } from '../utils';

// Helper to get base URL
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

type CreatePublicTrackingLinkContext = {
  tenantId: string;
  actorUserId: string;
  role: string;
  branchId: string | null;
};

export async function createPublicTrackingLink(
  claimId: string,
  context: CreatePublicTrackingLinkContext
): Promise<{ url: string; expiresAt: Date }> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.create_link',
    { recordResponse: true },
    async () => {
      const { tenantId, actorUserId, role, branchId } = context;

      // Verify visibility
      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId: actorUserId,
        role,
        branchId,
      });

      const claim = await db.query.claims.findFirst({
        where: and(eq(claims.id, claimId), visibilityCondition),
        columns: { id: true, tenantId: true },
      });

      if (!claim) {
        throw new Error('Claim not found or access denied');
      }

      // 2. Generate Token
      const tokenBuffer = crypto.randomBytes(32);
      const token = tokenBuffer.toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days TTL

      // 3. Revoke previous tokens (Optional but strictly safer as per plan)
      await db
        .update(claimTrackingTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(claimTrackingTokens.claimId, claimId), isNull(claimTrackingTokens.revokedAt))
        );

      // 4. Store Hash
      await db.insert(claimTrackingTokens).values({
        tenantId: claim.tenantId,
        claimId: claim.id,
        tokenHash,
        expiresAt,
      });

      // 5. Return URL
      const baseUrl = getBaseUrl();
      const url = `${baseUrl}/track/${token}`;

      return { url, expiresAt };
    }
  );
}

// Minimal Auth Stub if not found (will verify file existence next)
