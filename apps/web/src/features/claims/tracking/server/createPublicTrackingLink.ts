import { getServerDeploymentOrigin } from '@/lib/deployment-origin.server';
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
): Promise<{ url: string; expiresAt: Date }> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.create_link',
    { recordResponse: true },
    async () => {
      const { authority, actorUserId, role, branchId } = context;
      const { tenantId } = readTenantAuthority(authority);

      // Verify visibility
      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId: actorUserId,
        role,
        branchId,
      });

      // db-access-guard: tenant-scoped -- reason: tenant predicate built by claim visibility helper before tracking link claim lookup
      const claim = await withTenantAuthority(
        authority,
        async tx =>
          await tx.query.claims.findFirst({
            where: and(eq(claims.id, claimId), visibilityCondition),
            columns: { id: true, tenantId: true },
          })
      );

      if (!claim) {
        throw new Error('Claim not found or access denied');
      }

      const baseUrl = getServerDeploymentOrigin();

      // 2. Generate Token
      const tokenBuffer = crypto.randomBytes(32);
      const token = tokenBuffer.toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days TTL

      // 3. Revoke previous tokens (Optional but strictly safer as per plan)
      await withTenantAuthority(
        authority,
        async tx =>
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
            )
      );

      // 4. Store Hash
      // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
      await withTenantAuthority(
        authority,
        async tx =>
          await tx.insert(claimTrackingTokens).values({
            tenantId: claim.tenantId,
            claimId: claim.id,
            tokenHash,
            expiresAt,
          })
      );

      // 5. Return URL
      const url = `${baseUrl}/track/${token}`;

      return { url, expiresAt };
    }
  );
}

// Minimal Auth Stub if not found (will verify file existence next)
